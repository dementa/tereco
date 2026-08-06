import { AUTO_SCORED_TYPES, type QuestionType } from "./assessments";

/**
 * The single definition of "correct" in TERECO.
 *
 * This logic used to live inline in the live submission route. It was lifted
 * out when practice attempts (E-Papers) needed to mark the same answers the
 * same way. Two copies would have been fine for about a month and then drifted
 * on exactly one case — checkbox partial credit — and a learner told they got
 * something wrong in practice that was marked right in the real paper has no
 * reason to trust either number again.
 *
 * If live auto-marking or a teacher-marking path ever needs this, import it.
 * Do not reimplement it.
 */

/** Trim and case-fold. A learner typing "Kampala " must not be marked wrong. */
const norm = (s: string) => s.trim().toLowerCase();

/** The marks a question can carry, as far as auto-marking is concerned. */
export interface MarkableQuestion {
  questionType: QuestionType;
  correctAnswer?: string;
  maxScore: number;
}

/**
 * Whether a question can be marked without a human.
 *
 * A type in AUTO_SCORED_TYPES is necessary but not sufficient — the question
 * must also carry a correct answer. `questions_answerable_ck` makes that true
 * for every row written today, but rows predating the constraint exist, so it
 * is checked rather than assumed.
 */
export function isAutoMarkable(question: MarkableQuestion): boolean {
  return AUTO_SCORED_TYPES.has(question.questionType) && !!question.correctAnswer;
}

/**
 * Whether a given answer matches the expected one.
 *
 * Returns `undefined` — not `false` — when the question cannot be auto-marked.
 * That distinction is the whole point: `false` means "marked, and wrong",
 * `undefined` means "nobody has marked this yet". Collapsing them makes every
 * essay question read as a failure.
 *
 * Checkbox is all-or-nothing: the set of ticked choices must equal the set of
 * expected ones. There is no partial credit, because a checkbox question
 * carries a single `max_score` and nothing in the schema says what half of it
 * would mean. This matches what the live route has always done.
 */
export function isAnswerCorrect(
  question: MarkableQuestion,
  given: string
): boolean | undefined {
  if (!isAutoMarkable(question)) return undefined;
  const expected = question.correctAnswer!;

  if (question.questionType === "checkbox") {
    const a = given.split("|").map(norm).filter(Boolean).sort();
    const b = expected.split("|").map(norm).filter(Boolean).sort();
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  return norm(given) === norm(expected);
}

/**
 * The score for an auto-marked answer, or `undefined` to leave it for a human.
 *
 * `undefined` maps to a null `responses.score`, which is what the marking queue
 * and `recalc_submission_score()` both read as unmarked.
 */
export function autoScore(
  question: MarkableQuestion,
  given: string
): number | undefined {
  const correct = isAnswerCorrect(question, given);
  if (correct === undefined) return undefined;
  return correct ? question.maxScore : 0;
}
