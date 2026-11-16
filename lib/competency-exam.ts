/**
 * Competency Examination — the scoring rule, in one place.
 *
 * A practical exam here measures competency, not a graded paper. Each learner
 * gets one of three results:
 *
 *   Completed and saved the work   → 100%
 *   Attempted, did not complete    →  70%
 *   Absent                         →   0%
 *
 * "Absent gets nothing" is recorded as a real 0 rather than left blank, on
 * purpose: the school asked that a learner who did not sit the exam receive
 * no marks for it, and a blank would let them skip it without cost on the
 * term report. If that policy changes, change `score` on the absent result
 * here — nothing else in the app hard-codes it.
 *
 * Client-safe: no server imports, so the teacher's scoring screen and the
 * server aggregation share the exact same numbers.
 */

export const COMPETENCY_EXAM_TITLE_PREFIX = "Competency Exam: ";

export const COMPETENCY_RESULTS = [
  { code: "completed", label: "Completed", long: "Completed and saved the work", score: 100 },
  { code: "incomplete", label: "Not completed", long: "Attempted but did not complete", score: 70 },
  { code: "absent", label: "Absent", long: "Did not attend", score: 0 },
] as const;

export type CompetencyResult = (typeof COMPETENCY_RESULTS)[number]["code"];

/** Every competency mark is stored out of 100, so the score IS the percentage. */
export const COMPETENCY_MAX_SCORE = 100;

export function competencyScore(result: CompetencyResult): number {
  return COMPETENCY_RESULTS.find((r) => r.code === result)!.score;
}

/**
 * Reads a stored mark back as a result. Anything that is not exactly one of
 * the three scores (e.g. someone typed a mark through the generic enter-marks
 * tool) returns null rather than being rounded to the nearest band — the
 * teacher should see it as "not one of ours", not have it silently relabelled.
 */
export function competencyResultFromScore(total: number | null, max: number | null): CompetencyResult | null {
  if (total === null || max === null || max <= 0) return null;
  const pct = Math.round((total / max) * 1000) / 10;
  return COMPETENCY_RESULTS.find((r) => r.score === pct)?.code ?? null;
}

export function isCompetencyExamTitle(title: string | null | undefined): boolean {
  return !!title && title.startsWith(COMPETENCY_EXAM_TITLE_PREFIX);
}

/** "Competency Exam: Excel practical" → "Excel practical". */
export function competencyExamName(title: string): string {
  return isCompetencyExamTitle(title) ? title.slice(COMPETENCY_EXAM_TITLE_PREFIX.length) : title;
}

export function competencyExamTitle(name: string): string {
  return `${COMPETENCY_EXAM_TITLE_PREFIX}${name.trim()}`;
}
