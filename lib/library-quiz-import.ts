import { z } from "zod";

/**
 * The one shape a library quiz may be pasted in. Teachers get the prompt below,
 * give it to an AI together with their document, and paste back whatever it
 * returns. The format is strict on purpose: the prompt dictates it, and this
 * validator refuses anything else with an error that says which question is
 * wrong, so the teacher can fix it or re-run the AI rather than guess.
 *
 * The correct answer is a LETTER ("B"), not an index: models get 0- vs
 * 1-based indexes wrong far more often than they get a letter wrong. It is
 * converted to the stored index here and nowhere else.
 */

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
const LETTERS = "ABCDEF";

export interface ImportedQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
}

export interface ImportedQuiz {
  title: string;
  questions: ImportedQuestion[];
}

const RawQuestion = z.object({
  question: z.string().trim().min(1, "the question text is empty"),
  options: z
    .array(z.string().trim().min(1, "an option is empty"))
    .min(MIN_OPTIONS, `needs at least ${MIN_OPTIONS} options`)
    .max(MAX_OPTIONS, `has more than ${MAX_OPTIONS} options`),
  answer: z.string().trim().min(1, "no answer letter"),
  explanation: z.string().trim().optional(),
});

const RawQuiz = z.object({
  title: z.string().trim().min(1, "the quiz needs a title"),
  questions: z.array(z.unknown()).min(1, "the quiz has no questions"),
});

/** Models like to write "A) Paris" even when told not to. Strip it rather than reject a good quiz. */
function stripLetterPrefix(option: string): string {
  return option.replace(/^\(?[A-Fa-f][).:]\s+/, "").trim() || option;
}

/** Take the first JSON object out of whatever was pasted — models wrap it in ```json fences and chatter. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export type ImportResult = { ok: true; quiz: ImportedQuiz } | { ok: false; errors: string[] };

export function parseQuizJson(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch {
    return { ok: false, errors: ["That is not valid JSON. Paste the AI's reply exactly as it gave it."] };
  }

  const head = RawQuiz.safeParse(raw);
  if (!head.success) {
    return { ok: false, errors: head.error.issues.map((i) => i.message.charAt(0).toUpperCase() + i.message.slice(1) + ".") };
  }

  const errors: string[] = [];
  const questions: ImportedQuestion[] = [];

  head.data.questions.forEach((q, i) => {
    const n = i + 1;
    const parsed = RawQuestion.safeParse(q);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push(`Question ${n}: ${issue.message}.`);
      return;
    }
    const options = parsed.data.options.map(stripLetterPrefix);
    const letter = parsed.data.answer.replace(/[^A-Za-z]/g, "").toUpperCase();
    const correctIndex = letter.length === 1 ? LETTERS.indexOf(letter) : -1;

    if (correctIndex < 0 || correctIndex >= options.length) {
      errors.push(`Question ${n}: the answer "${parsed.data.answer}" is not one of its ${options.length} options.`);
      return;
    }
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      errors.push(`Question ${n}: two of its options are identical.`);
      return;
    }
    questions.push({
      prompt: parsed.data.question,
      options,
      correctIndex,
      explanation: parsed.data.explanation || null,
    });
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, quiz: { title: head.data.title, questions } };
}

/**
 * The prompt teachers are given. Fixed text, not a template the teacher edits:
 * the whole point is that every AI is asked for exactly the format
 * parseQuizJson accepts. `{{COUNT}}` is the only thing a teacher may vary.
 */
export const QUIZ_PROMPT_TEMPLATE = `You are helping a teacher write a multiple-choice quiz from the attached document.

Read the attached document. Write exactly {{COUNT}} multiple-choice questions that test understanding of what the document actually says.

Rules:
- Use ONLY information found in the attached document. Do not add outside facts.
- Each question has between 3 and 5 options. Exactly ONE option is correct.
- Options are plain text. Do NOT put letters or numbers in front of them ("A)", "1.").
- Do not use "all of the above" or "none of the above".
- Make wrong options plausible, not silly. Keep them a similar length to the right answer.
- Vary which letter is correct; do not always make it the same one.
- Write for the learner's level, in clear simple English.
- "explanation" is one short sentence saying why the answer is correct, using the document.

Reply with ONLY one JSON object in exactly this shape, and nothing else — no introduction, no notes, no markdown fences:

{
  "title": "A short quiz title",
  "questions": [
    {
      "question": "The question text?",
      "options": ["First option", "Second option", "Third option", "Fourth option"],
      "answer": "B",
      "explanation": "One sentence on why B is correct."
    }
  ]
}

"answer" is the LETTER of the correct option: "A" is the first option, "B" the second, and so on.`;

export function buildQuizPrompt(count: number): string {
  const n = Math.min(Math.max(Math.round(count) || 10, 1), 30);
  return QUIZ_PROMPT_TEMPLATE.replace("{{COUNT}}", String(n));
}
