import { getSupabaseAdmin } from "./supabase";
import { UserFacingError } from "./apiResponse";
import { autoScore, isAnswerCorrect, isAutoMarkable } from "./marking";
import { getQuestions, type Question } from "./assessments";

/**
 * E-Papers: closed assessments republished as untimed practice papers.
 *
 * The paper itself stays an `assessment` row — there is no second copy. Opting
 * in is `assessments.e_paper_at`, and a reopened or soft-deleted paper drops
 * out of `e_papers_for_student` with no cleanup job, because there is nothing
 * to clean up.
 *
 * Practice is recorded in its own tables. It must never touch
 * assessment_submissions: `unique (assessment_id, student_id)` there means one
 * row is one real sitting, and the sitting-once filter, the marking-reminder
 * digest, and every results table read it that way.
 */

export interface PracticeVerdict {
  questionId: string;
  code: string;
  questionText: string;
  questionType: string;
  options: string[];
  imageUrl?: string;
  maxScore: number;
  /** What the learner wrote. */
  answer: string;
  /**
   * true = correct, false = wrong, null = NOT AUTO-MARKABLE.
   *
   * Null is not a failure. Short and long answers land here and the results
   * screen must render them as "compare it yourself", never as a red cross.
   */
  isCorrect: boolean | null;
  /** What was expected. Only ever sent AFTER an attempt is finished. */
  expected?: string;
  modelAnswer?: string;
}

export interface PracticeAttemptResult {
  attemptId: string;
  assessmentId: string;
  assessmentTitle: string;
  systemId: string;
  startedAt: string;
  finishedAt: string | null;
  /** Auto-marked portion only — see autoMax. */
  autoScore: number | null;
  /**
   * The marks available on auto-markable questions ONLY, not the paper total.
   *
   * A paper with three multiple-choice and two essays reports out of the three.
   * Reporting out of five would silently count both essays as zero and hand the
   * learner a worse score than they earned.
   */
  autoMax: number | null;
  verdicts: PracticeVerdict[];
}

/**
 * A closed paper as the Library lists it.
 *
 * Deliberately NOT an `Assessment`. That type carries targets, collaborators
 * and instructions — authoring concerns a learner has no business receiving,
 * and which e_papers_for_student does not return anyway.
 */
export interface EPaper {
  id: string;
  systemId: string;
  title: string;
  description: string;
  /** Kept only so the card can say how long the real sitting was. Practice is untimed. */
  timeLimitMinutes: number;
  /** When it was published for practice. Drives "new" ordering. */
  ePaperAt: string | null;
  questionCount: number;
  /** How many times THIS learner has already practised it. */
  attemptCount: number;
}

/** Closed papers this learner may practise. Empty on error, never throws. */
export async function getEPapersForStudent(studentId: string): Promise<EPaper[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("e_papers_for_student", {
    p_student: studentId,
  });

  if (error) {
    console.error("Error fetching e-papers:", error);
    return [];
  }

  const rows = (data ?? []) as unknown as EPaperRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  // A paper with no questions is a dead end — it would open to "No questions
  // found". Counting here lets the Library drop it rather than offer it.
  const [{ data: questionRows }, { data: attemptRows }] = await Promise.all([
    supabase.from("questions").select("assessment_id").in("assessment_id", ids),
    supabase
      .from("practice_attempts")
      .select("assessment_id")
      .eq("student_id", studentId)
      .in("assessment_id", ids),
  ]);

  const questionCounts = tally((questionRows ?? []).map((r) => r.assessment_id));
  const attemptCounts = tally((attemptRows ?? []).map((r) => r.assessment_id));

  return rows
    .map((row) => ({
      id: row.id,
      systemId: row.system_id,
      title: row.title,
      description: row.description ?? "",
      timeLimitMinutes: row.time_limit_minutes,
      ePaperAt: row.e_paper_at,
      questionCount: questionCounts.get(row.id) ?? 0,
      attemptCount: attemptCounts.get(row.id) ?? 0,
    }))
    .filter((p) => p.questionCount > 0)
    // Newest first: the paper a learner just sat is the one they most want to
    // revise, and it is also the one most recently published for practice.
    .sort((a, b) => (b.ePaperAt ?? "").localeCompare(a.ePaperAt ?? ""));
}

/** Whether this learner may practise this specific paper. */
export async function canPractise(studentId: string, assessmentId: string): Promise<boolean> {
  const eligible = await getEPapersForStudent(studentId);
  return eligible.some((a) => a.id === assessmentId);
}

/**
 * Record a finished practice attempt and mark it.
 *
 * One shot: the attempt and all its responses are written when the learner
 * finishes, not as they go. Practice has nothing at stake, so there is no
 * partial state worth protecting and no resume story to get wrong. If the
 * request fails the learner's answers are still in localStorage and they can
 * press finish again.
 */
export async function recordPracticeAttempt(input: {
  assessmentId: string;
  studentId: string;
  enrollmentId?: string | null;
  /** Keyed by question id, exactly as the live submit route receives them. */
  answers: Record<string, string>;
}): Promise<{ attemptId: string }> {
  const supabase = getSupabaseAdmin();
  const questions = await getQuestions(input.assessmentId);

  if (questions.length === 0) {
    throw new UserFacingError("This paper has no questions to practise.");
  }

  // Marked with the SAME function the live submit route uses. Two
  // implementations would disagree on checkbox partial credit inside a month,
  // and a learner told they got something wrong in practice that was marked
  // right in the real paper has no reason to trust either number.
  let autoScoreTotal = 0;
  let autoMaxTotal = 0;
  const marked = questions.map((q) => {
    const answer = input.answers[q.id] ?? "";
    const correct = isAnswerCorrect(q, answer);
    if (isAutoMarkable(q)) {
      autoMaxTotal += q.maxScore;
      autoScoreTotal += autoScore(q, answer) ?? 0;
    }
    return { question: q, answer, correct };
  });

  const { data: attempt, error: attemptError } = await supabase
    .from("practice_attempts")
    .insert({
      assessment_id: input.assessmentId,
      student_id: input.studentId,
      enrollment_id: input.enrollmentId ?? null,
      finished_at: new Date().toISOString(),
      // Null rather than 0 when the paper is entirely short/long answers.
      // "0 out of 0" reads as a failure; nothing at all reads as "a human has
      // to look at this", which is the truth.
      auto_score: autoMaxTotal > 0 ? autoScoreTotal : null,
      auto_max: autoMaxTotal > 0 ? autoMaxTotal : null,
    })
    .select("id, started_at, finished_at, auto_score, auto_max")
    .single();

  if (attemptError || !attempt) {
    console.error("Error creating practice attempt:", attemptError);
    throw new UserFacingError("Could not save this practice attempt. Please try again.");
  }

  const { error: responsesError } = await supabase.from("practice_responses").insert(
    marked.map((m) => ({
      attempt_id: attempt.id,
      question_id: m.question.id,
      answer: m.answer,
      // Deliberately `?? null` — undefined from isAnswerCorrect means "not
      // auto-markable", which is exactly what a null column means here.
      is_correct: m.correct ?? null,
    }))
  );

  if (responsesError) {
    // The attempt row without its responses is a score with nothing behind it.
    // Drop it rather than leave a result the learner cannot open.
    await supabase.from("practice_attempts").delete().eq("id", attempt.id);
    console.error("Error saving practice responses:", responsesError);
    throw new UserFacingError("Could not save your answers. Please try again.");
  }

  // Just the id. The results screen reads the attempt back through
  // getPracticeAttempt, which is the one place that checks ownership before
  // handing out expected answers — so there is exactly one such path, not two.
  return { attemptId: attempt.id };
}

/**
 * Read back a finished attempt, with the expected answers.
 *
 * Ownership is checked here rather than by the caller: this is the only place
 * that hands out `correct_answer` and `model_answer` to a student, so the guard
 * belongs where the data does.
 */
export async function getPracticeAttempt(
  attemptId: string,
  studentId: string
): Promise<PracticeAttemptResult | null> {
  const supabase = getSupabaseAdmin();

  const { data: attempt, error } = await supabase
    .from("practice_attempts")
    .select(
      "id, assessment_id, student_id, started_at, finished_at, auto_score, auto_max, assessments(title, system_id)"
    )
    .eq("id", attemptId)
    .maybeSingle();

  if (error || !attempt) return null;
  if (attempt.student_id !== studentId) return null;

  const { data: responses } = await supabase
    .from("practice_responses")
    .select("question_id, answer, is_correct")
    .eq("attempt_id", attemptId);

  const byQuestion = new Map(
    (responses ?? []).map((r) => [r.question_id, r])
  );

  const questions = await getQuestions(attempt.assessment_id);
  const meta = attempt.assessments as unknown as { title: string; system_id: string } | null;

  return {
    attemptId: attempt.id,
    assessmentId: attempt.assessment_id,
    assessmentTitle: meta?.title ?? "Practice paper",
    systemId: meta?.system_id ?? "",
    startedAt: attempt.started_at,
    finishedAt: attempt.finished_at,
    autoScore: attempt.auto_score === null ? null : Number(attempt.auto_score),
    autoMax: attempt.auto_max === null ? null : Number(attempt.auto_max),
    verdicts: questions.map((q) => {
      const r = byQuestion.get(q.id);
      return toVerdict(q, r?.answer ?? "", r?.is_correct ?? null);
    }),
  };
}

/** How many times this learner has practised this paper. */
export async function countAttempts(studentId: string, assessmentId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("practice_attempts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("assessment_id", assessmentId);
  return count ?? 0;
}

// ─── Internals ──────────────────────────────────────────────

/**
 * A verdict carries the expected answer, so it may only ever be built for a
 * FINISHED attempt. Nothing in this module returns one before the answers are
 * recorded.
 */
function toVerdict(q: Question, answer: string, isCorrect: boolean | null): PracticeVerdict {
  return {
    questionId: q.id,
    code: q.code,
    questionText: q.questionText,
    questionType: q.questionType,
    options: q.options ?? [],
    imageUrl: q.imageUrl,
    maxScore: q.maxScore,
    answer,
    isCorrect,
    expected: q.correctAnswer,
    modelAnswer: q.modelAnswer,
  };
}

/** The subset of the assessments row e_papers_for_student returns that we use. */
interface EPaperRow {
  id: string;
  system_id: string;
  title: string;
  description: string | null;
  time_limit_minutes: number;
  e_paper_at: string | null;
}

function tally(ids: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}
