import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentAcademicYear } from "@/lib/entities/academic-years";

export interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  studentSystemId: string | null;
  assessmentsCount: number;
  averagePercentage: number;
  rank: number;
}

export interface ClassLeaderboardParams {
  schoolId: string;
  classId: string;
  streamId?: string;
  academicYearId?: string;
  termId?: string;
  assessmentId?: string;
}

export interface SchoolLeaderboardParams {
  schoolId: string;
  classId?: string;
  academicYearId?: string;
  termId?: string;
  assessmentId?: string;
}

interface SubmissionAggRow {
  student_id: string;
  status: string;
  total_score: number | null;
  max_score: number | null;
  student: { system_id: string | null; first_name: string; middle_name: string | null; last_name: string } | null;
}

const LEADERBOARD_COLUMNS =
  "student_id, total_score, max_score, status, student:profiles!assessment_submissions_student_id_fkey(system_id, first_name, middle_name, last_name), enrollment:enrollments!inner(school_id, class_id, stream_id, academic_year_id), assessment:assessments!inner(id, term_id, deleted_at)";

/**
 * A submission only has a meaningful percentage once marking is finished.
 * `total_score`/`max_score` are trigger-maintained from responses, but a
 * partial total on an in-progress or unmarked submission would read as a low
 * score rather than an incomplete one — same rule as getAssessmentResults.
 */
function isRankable(row: { status: string; total_score: number | null; max_score: number | null }): boolean {
  return row.status === "marked" && row.total_score !== null && row.max_score !== null && row.max_score > 0;
}

function percentOf(total: number, max: number): number {
  return Math.round((total / max) * 1000) / 10;
}

function studentName(student: SubmissionAggRow["student"]): string {
  if (!student) return "";
  return [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ").trim();
}

interface LeaderboardFilters {
  schoolId: string;
  classId?: string;
  streamId?: string;
  academicYearId?: string;
  termId?: string;
  assessmentId?: string;
}

/** Shared query + aggregation behind both the class and school leaderboards. */
async function queryLeaderboard(filters: LeaderboardFilters): Promise<LeaderboardEntry[]> {
  const { schoolId, classId, streamId, termId, assessmentId } = filters;
  let academicYearId = filters.academicYearId;
  if (!academicYearId) {
    const currentYear = await getCurrentAcademicYear();
    if (!currentYear) return [];
    academicYearId = currentYear.id;
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("assessment_submissions")
    .select(LEADERBOARD_COLUMNS)
    .eq("status", "marked")
    .eq("enrollment.school_id", schoolId)
    .eq("enrollment.academic_year_id", academicYearId)
    .is("assessment.deleted_at", null);

  if (classId) query = query.eq("enrollment.class_id", classId);
  if (streamId) query = query.eq("enrollment.stream_id", streamId);
  if (termId) query = query.eq("assessment.term_id", termId);
  if (assessmentId) query = query.eq("assessment_id", assessmentId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as SubmissionAggRow[];

  const byStudent = new Map<string, { name: string; systemId: string | null; percentages: number[] }>();
  for (const row of rows) {
    if (!isRankable(row)) continue;
    const percentage = percentOf(row.total_score as number, row.max_score as number);
    const existing = byStudent.get(row.student_id);
    if (existing) {
      existing.percentages.push(percentage);
    } else {
      byStudent.set(row.student_id, {
        name: studentName(row.student),
        systemId: row.student?.system_id ?? null,
        percentages: [percentage],
      });
    }
  }

  const entries: Omit<LeaderboardEntry, "rank">[] = Array.from(byStudent.entries()).map(([studentId, agg]) => ({
    studentId,
    studentName: agg.name,
    studentSystemId: agg.systemId,
    assessmentsCount: agg.percentages.length,
    averagePercentage: Math.round((agg.percentages.reduce((sum, p) => sum + p, 0) / agg.percentages.length) * 10) / 10,
  }));

  entries.sort((a, b) => b.averagePercentage - a.averagePercentage);

  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/**
 * Ranks students in one class by their average assessment performance.
 *
 * The average is the mean of each student's per-assessment percentages, not
 * sum(total_score)/sum(max_score) — assessments can carry very different
 * max_scores (a 10-question quiz vs. a 40-question exam), and a ratio-of-sums
 * would let one heavily-weighted paper dominate a student's standing.
 *
 * Only marked submissions count; a student with zero marked submissions in
 * scope is simply absent from the result, not shown with a null score.
 */
export async function getClassLeaderboard(params: ClassLeaderboardParams): Promise<LeaderboardEntry[]> {
  return queryLeaderboard(params);
}

/**
 * Same ranking as {@link getClassLeaderboard}, scoped to a whole school
 * instead of one class — `classId` narrows it to a single class within the
 * school without changing the shape, for a school-admin's optional drill-down.
 */
export async function getSchoolLeaderboard(params: SchoolLeaderboardParams): Promise<LeaderboardEntry[]> {
  return queryLeaderboard(params);
}

export interface ClassTopPerformersParams {
  schoolId: string;
  classId: string;
  streamId?: string;
  /** Required — the honor roll is a per-term thing, never an all-time list. */
  termId: string;
}

export interface TopPerformer {
  studentId: string;
  studentName: string;
  rank: number;
}

/**
 * The top 3 students in a class for one term, names included — the *only*
 * roster-shaped result allowed to reach a parent/student (see
 * getTopPerformersForStudent below). It's getClassLeaderboard sliced to 3
 * rows, so there's no larger list in scope to accidentally over-expose.
 */
export async function getClassTopPerformers(params: ClassTopPerformersParams): Promise<TopPerformer[]> {
  const leaderboard = await queryLeaderboard(params);
  return leaderboard.slice(0, 3).map(({ studentId, studentName, rank }) => ({ studentId, studentName, rank }));
}

export interface TermAverage {
  termId: string;
  termNumber: number;
  averagePercentage: number;
}

interface StudentTrendRow {
  total_score: number | null;
  max_score: number | null;
  status: string;
  assessment: {
    deleted_at: string | null;
    term: { id: string; number: number; academic_year_id: string } | null;
  } | null;
}

const STUDENT_TREND_COLUMNS =
  "total_score, max_score, status, assessment:assessments!inner(deleted_at, term:terms(id, number, academic_year_id))";

/**
 * A student's own average percentage per term, oldest first — their own
 * data only, already fully visible to them today via "My Results", so this
 * is not a new privacy surface. Used to build a term-over-term encouragement
 * message for students outside the top 3, never a comparison to classmates.
 */
export async function getStudentTermAverages(studentId: string, academicYearId?: string): Promise<TermAverage[]> {
  let yearId = academicYearId;
  if (!yearId) {
    const currentYear = await getCurrentAcademicYear();
    if (!currentYear) return [];
    yearId = currentYear.id;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessment_submissions")
    .select(STUDENT_TREND_COLUMNS)
    .eq("student_id", studentId)
    .eq("status", "marked")
    .is("assessment.deleted_at", null);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as StudentTrendRow[];
  const byTerm = new Map<string, { number: number; percentages: number[] }>();
  for (const row of rows) {
    const term = row.assessment?.term;
    if (!term || term.academic_year_id !== yearId) continue;
    if (!isRankable(row)) continue;
    const percentage = percentOf(row.total_score as number, row.max_score as number);
    const existing = byTerm.get(term.id);
    if (existing) existing.percentages.push(percentage);
    else byTerm.set(term.id, { number: term.number, percentages: [percentage] });
  }

  const averages: TermAverage[] = Array.from(byTerm.entries()).map(([termId, agg]) => ({
    termId,
    termNumber: agg.number,
    averagePercentage: Math.round((agg.percentages.reduce((sum, p) => sum + p, 0) / agg.percentages.length) * 10) / 10,
  }));

  averages.sort((a, b) => a.termNumber - b.termNumber);
  return averages;
}

/** Most recently started term as of today for one school — terms have no app-side "current" flag, unlike academic years. */
async function getCurrentTermId(schoolId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("terms")
    .select("id")
    .eq("school_id", schoolId)
    .lte("starts_on", today)
    .order("starts_on", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.id ?? null;
}

function buildMotivationalMessage(trend: TermAverage[]): string {
  if (trend.length === 0) {
    return "No marked results yet this year — your hard work will show up here soon!";
  }
  if (trend.length === 1) {
    return "Great start this term! Keep working hard and you could be a top performer next term.";
  }
  const current = trend[trend.length - 1].averagePercentage;
  const previous = trend[trend.length - 2].averagePercentage;
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff > 0) return `You're improving! Up ${diff}% from last term — keep it up!`;
  if (diff < 0) return "Every term is a fresh start — keep pushing, you've got this!";
  return "Steady work this term! Keep pushing to reach the next level.";
}

export interface TopPerformersResult {
  /** Populated only when the requesting student is in it — celebrating them and their classmates. */
  topPerformers: TopPerformer[];
  isFeatured: boolean;
  /** Populated only when NOT featured — a self-referential encouragement, never a comparison to classmates or a rank/position. */
  message: string | null;
}

/**
 * The single entry point parent/student routes are allowed to call for this
 * feature. Resolves the student's current class/term, gets the class's top 3,
 * and returns either that list (if the student is in it) or a private
 * motivational message (if not) — never both, and never the student's own
 * rank/position when they're outside the top 3.
 */
export async function getTopPerformersForStudent(studentId: string): Promise<TopPerformersResult> {
  const supabase = getSupabaseAdmin();
  const { data: enrollment, error } = await supabase
    .from("current_enrollments")
    .select("school_id, class_id, stream_id, academic_year_id")
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!enrollment || !enrollment.school_id || !enrollment.class_id || !enrollment.academic_year_id) {
    return { topPerformers: [], isFeatured: false, message: null };
  }

  const termId = await getCurrentTermId(enrollment.school_id);
  if (!termId) return { topPerformers: [], isFeatured: false, message: null };

  const topPerformers = await getClassTopPerformers({
    schoolId: enrollment.school_id,
    classId: enrollment.class_id,
    streamId: enrollment.stream_id ?? undefined,
    termId,
  });

  const isFeatured = topPerformers.some((p) => p.studentId === studentId);
  if (isFeatured) return { topPerformers, isFeatured, message: null };

  const trend = await getStudentTermAverages(studentId, enrollment.academic_year_id);
  return { topPerformers: [], isFeatured: false, message: buildMotivationalMessage(trend) };
}

export interface SchoolBenchmarkParams {
  academicYearId?: string;
  termId?: string;
  assessmentId?: string;
}

export interface SchoolBenchmarkEntry {
  schoolId: string;
  schoolName: string;
  studentsAssessed: number;
  submissionsCount: number;
  averagePercentage: number;
  medianPercentage: number;
  rank: number;
}

interface BenchmarkRow {
  student_id: string;
  status: string;
  total_score: number | null;
  max_score: number | null;
  enrollment: { school_id: string; school: { name: string } | null } | null;
}

// Deliberately no student profile join — a super-admin comparing schools
// doesn't need any student's name, so the query can't return one. This is the
// actual privacy boundary for the cross-school view, not a later field-strip.
const BENCHMARK_COLUMNS =
  "student_id, total_score, max_score, status, enrollment:enrollments!inner(school_id, academic_year_id, school:schools(name)), assessment:assessments!inner(id, term_id, deleted_at)";

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Ranks schools against each other by average student performance, for the
 * super-admin cross-school view. Returns per-school aggregates only — never
 * a per-student list — so a super-admin doesn't see every student's name in
 * every school just to compare schools; a "top students system-wide" view
 * would need its own, separately-reviewed function, not this one widened.
 *
 * Every query is scoped to at least one academic year (defaulting to the
 * current one) — an unscoped "all time, all schools" query is the one place
 * in this feature row counts could actually grow large.
 */
export async function getSchoolBenchmark(params: SchoolBenchmarkParams): Promise<SchoolBenchmarkEntry[]> {
  const { termId, assessmentId } = params;
  let academicYearId = params.academicYearId;
  if (!academicYearId) {
    const currentYear = await getCurrentAcademicYear();
    if (!currentYear) return [];
    academicYearId = currentYear.id;
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("assessment_submissions")
    .select(BENCHMARK_COLUMNS)
    .eq("status", "marked")
    .eq("enrollment.academic_year_id", academicYearId)
    .is("assessment.deleted_at", null);

  if (termId) query = query.eq("assessment.term_id", termId);
  if (assessmentId) query = query.eq("assessment_id", assessmentId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as BenchmarkRow[];

  // First pass: per-student average, same as queryLeaderboard, so one
  // prolific test-taker or one heavily-weighted paper doesn't dominate.
  const byStudent = new Map<string, { schoolId: string; schoolName: string; percentages: number[] }>();
  for (const row of rows) {
    if (!isRankable(row) || !row.enrollment) continue;
    const percentage = percentOf(row.total_score as number, row.max_score as number);
    const existing = byStudent.get(row.student_id);
    if (existing) {
      existing.percentages.push(percentage);
    } else {
      byStudent.set(row.student_id, {
        schoolId: row.enrollment.school_id,
        schoolName: row.enrollment.school?.name ?? "",
        percentages: [percentage],
      });
    }
  }

  // Second pass: group student averages by school.
  const bySchool = new Map<string, { schoolName: string; studentAverages: number[]; submissionsCount: number }>();
  for (const { schoolId, schoolName, percentages } of byStudent.values()) {
    const studentAverage = percentages.reduce((sum, p) => sum + p, 0) / percentages.length;
    const existing = bySchool.get(schoolId);
    if (existing) {
      existing.studentAverages.push(studentAverage);
      existing.submissionsCount += percentages.length;
    } else {
      bySchool.set(schoolId, { schoolName, studentAverages: [studentAverage], submissionsCount: percentages.length });
    }
  }

  const entries: Omit<SchoolBenchmarkEntry, "rank">[] = Array.from(bySchool.entries()).map(([schoolId, agg]) => {
    const sorted = [...agg.studentAverages].sort((a, b) => a - b);
    return {
      schoolId,
      schoolName: agg.schoolName,
      studentsAssessed: agg.studentAverages.length,
      submissionsCount: agg.submissionsCount,
      averagePercentage: Math.round((sorted.reduce((sum, p) => sum + p, 0) / sorted.length) * 10) / 10,
      medianPercentage: Math.round(median(sorted) * 10) / 10,
    };
  });

  entries.sort((a, b) => b.averagePercentage - a.averagePercentage);

  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export interface TrendPoint {
  label: string;
  value: number;
}

interface TrendRow {
  total_score: number | null;
  max_score: number | null;
  status: string;
  assessment_id: string;
  assessment: { title: string; closes_at: string | null; opens_at: string | null } | null;
}

const SCHOOL_TREND_COLUMNS =
  "total_score, max_score, status, assessment_id, assessment:assessments!inner(title, closes_at, opens_at, deleted_at), enrollment:enrollments!inner(school_id, academic_year_id)";
const STAFF_TREND_COLUMNS =
  "total_score, max_score, status, assessment_id, assessment:assessments!inner(title, closes_at, opens_at, deleted_at, created_by), enrollment:enrollments!inner(academic_year_id)";
const SYSTEM_TREND_COLUMNS =
  "total_score, max_score, status, assessment_id, assessment:assessments!inner(title, closes_at, opens_at, deleted_at), enrollment:enrollments!inner(academic_year_id)";

/** Groups rankable rows by assessment, averages each, and returns the last `limit` by close/open date. */
function aggregateTrend(rows: TrendRow[], limit: number): TrendPoint[] {
  const byAssessment = new Map<string, { title: string; date: string; percentages: number[] }>();
  for (const row of rows) {
    if (!isRankable(row) || !row.assessment) continue;
    const percentage = percentOf(row.total_score as number, row.max_score as number);
    const date = row.assessment.closes_at ?? row.assessment.opens_at ?? "";
    const existing = byAssessment.get(row.assessment_id);
    if (existing) existing.percentages.push(percentage);
    else byAssessment.set(row.assessment_id, { title: row.assessment.title, date, percentages: [percentage] });
  }

  const points = Array.from(byAssessment.values())
    .map((a) => ({
      label: a.title,
      date: a.date,
      value: Math.round((a.percentages.reduce((sum, p) => sum + p, 0) / a.percentages.length) * 10) / 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return points.slice(-limit).map(({ label, value }) => ({ label, value }));
}

async function resolveAcademicYearId(academicYearId?: string): Promise<string | null> {
  if (academicYearId) return academicYearId;
  const currentYear = await getCurrentAcademicYear();
  return currentYear?.id ?? null;
}

/** Average marked percentage per completed assessment, oldest-to-newest, last `limit` — feeds a school dashboard's stat-tile sparkline. */
export async function getSchoolAssessmentTrend(schoolId: string, limit = 6, academicYearId?: string): Promise<TrendPoint[]> {
  const yearId = await resolveAcademicYearId(academicYearId);
  if (!yearId) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessment_submissions")
    .select(SCHOOL_TREND_COLUMNS)
    .eq("status", "marked")
    .eq("enrollment.school_id", schoolId)
    .eq("enrollment.academic_year_id", yearId)
    .is("assessment.deleted_at", null);
  if (error) throw new Error(error.message);

  return aggregateTrend((data ?? []) as unknown as TrendRow[], limit);
}

/** Same shape as {@link getSchoolAssessmentTrend}, scoped to one teacher's own authored assessments. */
export async function getStaffAssessmentTrend(staffId: string, limit = 6, academicYearId?: string): Promise<TrendPoint[]> {
  const yearId = await resolveAcademicYearId(academicYearId);
  if (!yearId) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessment_submissions")
    .select(STAFF_TREND_COLUMNS)
    .eq("status", "marked")
    .eq("assessment.created_by", staffId)
    .eq("enrollment.academic_year_id", yearId)
    .is("assessment.deleted_at", null);
  if (error) throw new Error(error.message);

  return aggregateTrend((data ?? []) as unknown as TrendRow[], limit);
}

/**
 * Same shape as {@link getSchoolAssessmentTrend}, system-wide, for the
 * super-admin dashboard. Always scoped to one academic year by default —
 * this is a sparkline, not a report, so it never needs an unscoped
 * all-time/all-schools query.
 */
export async function getSystemAssessmentTrend(limit = 6, academicYearId?: string): Promise<TrendPoint[]> {
  const yearId = await resolveAcademicYearId(academicYearId);
  if (!yearId) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessment_submissions")
    .select(SYSTEM_TREND_COLUMNS)
    .eq("status", "marked")
    .eq("enrollment.academic_year_id", yearId)
    .is("assessment.deleted_at", null);
  if (error) throw new Error(error.message);

  return aggregateTrend((data ?? []) as unknown as TrendRow[], limit);
}
