import { getSupabaseAdmin } from "@/lib/supabase";
import { getAssessmentResults, getQuestions, readAllPages, type Assessment } from "@/lib/assessments";

export interface QuestionStat {
  questionId: string;
  code: string;
  questionText: string;
  maxScore: number;
  /** Responses recorded for this question, marked or not. */
  respondedCount: number;
  /** Of those, how many have a score — the rest are still awaiting a marker. */
  markedCount: number;
  /** avg(score)/maxScore over marked responses only. Null when nothing is marked yet. */
  averagePercent: number | null;
  fullMarksCount: number;
}

export interface PerformerEntry {
  studentId: string;
  studentName: string;
  studentSystemId: string | null;
  className: string;
  percentage: number;
}

export interface AssessmentAnalytics {
  summary: {
    eligibleCount: number;
    satCount: number;
    missedCount: number;
    markedCount: number;
    submittedNotMarkedCount: number;
    averagePercent: number | null;
    medianPercent: number | null;
    highestPercent: number | null;
    lowestPercent: number | null;
  };
  /** Sorted worst-to-best by averagePercent (unmarked questions last). */
  questionStats: QuestionStat[];
  /** Ten fixed-width buckets covering 0–100%. */
  distribution: { bucket: string; count: number }[];
  topPerformers: PerformerEntry[];
  bottomPerformers: PerformerEntry[];
}

interface EligibleRow {
  student_id: string;
  enrollment_id: string;
  school_id: string;
  class_id: string;
  level: number;
}

interface QuestionResponseRow {
  question_id: string;
  score: number | null;
}

// `submission.enrollment` must be `!inner` for the same reason RESULT_COLUMNS
// is in lib/assessments.ts: PostgREST only honours a filter against an
// embedded table when that embed is an inner join, and a scoped caller here
// (school_admin) must never silently fall back to "every school" if the
// filter were quietly ignored.
const QUESTION_RESPONSE_COLUMNS =
  "question_id, score, submission:assessment_submissions!inner(assessment_id, enrollment:enrollments!inner(school_id))";

function percentile(sortedPercents: number[], p: number): number {
  if (sortedPercents.length === 1) return sortedPercents[0];
  const index = (sortedPercents.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedPercents[lower];
  const weight = index - lower;
  return sortedPercents[lower] * (1 - weight) + sortedPercents[upper] * weight;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The full analytics picture for one assessment: who was eligible, who sat
 * it, how each question performed, and who's at the top and bottom of the
 * distribution.
 *
 * `opts.schoolId` narrows every count to one school's students — used by
 * school_admin routes. Eligibility comes from `eligible_students_for_assessment`,
 * which shares its target-matching predicate with `assessments_for_student`
 * (see scripts/schema/27-assessment-eligibility.sql) so this can never
 * disagree with what a learner is actually offered.
 */
export async function getAssessmentAnalytics(
  assessment: Assessment,
  opts?: { schoolId?: string }
): Promise<AssessmentAnalytics> {
  const supabase = getSupabaseAdmin();

  const [results, eligibleResult, questions, responseRows] = await Promise.all([
    getAssessmentResults(assessment.id, opts),
    (async () => {
      let query = supabase.rpc("eligible_students_for_assessment", { p_assessment: assessment.id });
      if (opts?.schoolId) query = query.eq("school_id", opts.schoolId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as EligibleRow[];
    })(),
    getQuestions(assessment.id),
    readAllPages<QuestionResponseRow>((from, to) => {
      let query = supabase
        .from("responses")
        .select(QUESTION_RESPONSE_COLUMNS)
        .eq("submission.assessment_id", assessment.id);
      if (opts?.schoolId) query = query.eq("submission.enrollment.school_id", opts.schoolId);
      return query.order("id", { ascending: true }).range(from, to);
    }),
  ]);

  // ── Summary ──────────────────────────────────────────────────────────────
  const satStudentIds = new Set(results.map((r) => r.studentId));
  const missedCount = eligibleResult.filter((e) => !satStudentIds.has(e.student_id)).length;
  const markedCount = results.filter((r) => r.status === "marked").length;
  const submittedNotMarkedCount = results.filter((r) => r.status === "submitted").length;

  const percents = results
    .map((r) => r.percentage)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b);

  const summary = {
    eligibleCount: eligibleResult.length,
    satCount: results.length,
    missedCount,
    markedCount,
    submittedNotMarkedCount,
    averagePercent: percents.length ? round1(percents.reduce((sum, p) => sum + p, 0) / percents.length) : null,
    medianPercent: percents.length ? round1(percentile(percents, 0.5)) : null,
    highestPercent: percents.length ? percents[percents.length - 1] : null,
    lowestPercent: percents.length ? percents[0] : null,
  };

  // ── Per-question stats ───────────────────────────────────────────────────
  const byQuestion = new Map<string, { responded: number; marked: number; scoreSum: number; fullMarks: number }>();
  for (const row of responseRows) {
    const bucket = byQuestion.get(row.question_id) ?? { responded: 0, marked: 0, scoreSum: 0, fullMarks: 0 };
    bucket.responded += 1;
    byQuestion.set(row.question_id, bucket);
  }
  const questionsById = new Map(questions.map((q) => [q.id, q]));
  for (const row of responseRows) {
    if (row.score === null) continue;
    const question = questionsById.get(row.question_id);
    const bucket = byQuestion.get(row.question_id);
    if (!question || !bucket) continue;
    bucket.marked += 1;
    bucket.scoreSum += question.maxScore > 0 ? row.score / question.maxScore : 0;
    if (question.maxScore > 0 && row.score >= question.maxScore) bucket.fullMarks += 1;
  }

  const questionStats: QuestionStat[] = questions.map((q) => {
    const bucket = byQuestion.get(q.id) ?? { responded: 0, marked: 0, scoreSum: 0, fullMarks: 0 };
    return {
      questionId: q.id,
      code: q.code,
      questionText: q.questionText,
      maxScore: q.maxScore,
      respondedCount: bucket.responded,
      markedCount: bucket.marked,
      averagePercent: bucket.marked > 0 ? round1((bucket.scoreSum / bucket.marked) * 100) : null,
      fullMarksCount: bucket.fullMarks,
    };
  });
  // Unmarked questions (averagePercent === null) sort last — there's nothing
  // to call "worst done" yet, and they shouldn't crowd out ones that are.
  questionStats.sort((a, b) => {
    if (a.averagePercent === null && b.averagePercent === null) return 0;
    if (a.averagePercent === null) return 1;
    if (b.averagePercent === null) return -1;
    return a.averagePercent - b.averagePercent;
  });

  // ── Score distribution ───────────────────────────────────────────────────
  const distribution = Array.from({ length: 10 }, (_, i) => {
    const lo = i * 10;
    const hi = lo + 10;
    return { bucket: i === 9 ? `${lo}-100` : `${lo}-${hi - 1}`, count: 0 };
  });
  for (const p of percents) {
    const index = Math.min(9, Math.floor(p / 10));
    distribution[index].count += 1;
  }

  // ── Top/bottom performers ────────────────────────────────────────────────
  const ranked = results
    .filter((r): r is typeof r & { percentage: number } => r.percentage !== null)
    .map((r): PerformerEntry => ({
      studentId: r.studentId,
      studentName: r.studentName,
      studentSystemId: r.studentSystemId,
      className: r.className,
      percentage: r.percentage,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  // Capped so a small cohort (fewer than 10 marked results) doesn't show the
  // same students in both lists — bottomCount shrinks to leave topPerformers
  // and bottomPerformers non-overlapping.
  const topPerformers = ranked.slice(0, 5);
  const bottomCount = Math.min(5, Math.max(0, ranked.length - topPerformers.length));
  const bottomPerformers = bottomCount > 0 ? ranked.slice(-bottomCount).reverse() : [];

  return { summary, questionStats, distribution, topPerformers, bottomPerformers };
}
