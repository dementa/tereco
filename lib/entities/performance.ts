import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentAcademicYear } from "@/lib/entities/academic-years";

export interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  studentSystemId: string | null;
  assessmentsCount: number;
  /** The blended figure — written and attendance combined. What every marks display shows. */
  averagePercentage: number;
  /** Mean of marked assessment percentages alone, before the attendance blend — kept for transparency. */
  written: number;
  /** % of this term's lesson-attendance sessions the student was present for, or null with no attendance data recorded (never treated as 0). */
  attendanceRate: number | null;
  /** Share of averagePercentage taken from attendance, 0..1. 0 whenever attendanceRate is null. */
  attendanceWeight: number;
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
  submitted_at: string;
  student: { system_id: string | null; first_name: string; middle_name: string | null; last_name: string } | null;
}

const LEADERBOARD_COLUMNS =
  "student_id, total_score, max_score, status, submitted_at, student:profiles!assessment_submissions_student_id_fkey(system_id, first_name, middle_name, last_name), enrollment:enrollments!inner(school_id, class_id, stream_id, academic_year_id), assessment:assessments!inner(id, deleted_at)";

interface TermWindow {
  id: string;
  number: number;
  school_id: string;
  starts_on: string;
  ends_on: string;
}

/**
 * Whether a submission falls inside a term, by the date it was submitted.
 *
 * Nothing here filters on assessments.term_id, and nothing should. That column
 * has never held a value on any row and cannot: an assessment is targeted
 * through assessment_targets and may span several schools — or none at all,
 * meaning every school — while terms are per-school, so a multi-school
 * assessment has no single correct term. Filtering on it silently matched
 * nothing, which is a worse failure than an error: picking "Term II" emptied
 * the leaderboard, the honour roll and the cross-school benchmark, and each
 * read as "nobody has done any work" rather than "this filter is broken".
 *
 * A submission is unambiguous by comparison — enrollment_id resolves to one
 * school, submitted_at to one date — so containment is checked the same way
 * term_for_date() does it in SQL.
 */
function inTerm(term: TermWindow, submittedAt: string): boolean {
  const on = submittedAt.slice(0, 10);
  return term.starts_on <= on && on <= term.ends_on;
}

/**
 * The day after `date`, as an exclusive upper bound.
 *
 * submitted_at is a timestamp and ends_on is a date, so `submitted_at <=
 * ends_on` would compare against midnight and silently drop everything
 * submitted during the term's last day — the day an end-of-term paper is most
 * likely to be sat.
 */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** One school's term, used to turn a termId into a date window. */
async function getTermWindow(termId: string): Promise<TermWindow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("terms")
    .select("id, number, school_id, starts_on, ends_on")
    .eq("id", termId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TermWindow | null) ?? null;
}

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

/**
 * Every marks display blends in attendance, not just the written average — a
 * learner who has been in class all term should not read the same as one who
 * has not, and a learner who has sat every paper should not be punished for a
 * school that has not logged attendance. Fixed here rather than a per-school
 * column (the way schools.practical_weight is): turning this on was the
 * explicit ask, not a gradual rollout, so there's no "still at zero" state to
 * protect. Promote to a column later if a school ever needs to opt out.
 */
export const ATTENDANCE_WEIGHT = 0.5;

export interface AttendanceBlend {
  written: number;
  attendanceRate: number | null;
  weight: number;
  overall: number;
}

/**
 * Same null-safety rule practical observations uses for its own blend: a
 * learner with no attendance rows this term is never dragged toward 0 for it
 * — the overall figure is simply the written one until attendance exists to
 * blend with.
 */
export function blendWithAttendance(
  written: number,
  attendanceRate: number | null,
  weight: number = ATTENDANCE_WEIGHT
): AttendanceBlend {
  const w = attendanceRate === null ? 0 : Math.min(1, Math.max(0, weight));
  const overall =
    attendanceRate === null ? written : Math.round((written * (1 - w) + attendanceRate * w) * 10) / 10;
  return { written, attendanceRate, weight: w, overall };
}

/**
 * Present/total across a term's LESSON attendance sessions only — never the
 * supervised-sitting registers taken while a student sits an assessment,
 * which measure something else and would double-count with the written side
 * of the blend. One query for every student on a leaderboard, not one per row.
 */
async function getAttendanceRatesForTerm(studentIds: string[], termId: string): Promise<Map<string, number>> {
  const rates = new Map<string, number>();
  if (studentIds.length === 0) return rates;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("lesson_attendance")
    .select("student_id, is_present, session:attendance_sessions!inner(term_id, kind)")
    .in("student_id", studentIds)
    .eq("session.term_id", termId)
    .eq("session.kind", "lesson");
  if (error) throw new Error(error.message);

  const counts = new Map<string, { present: number; total: number }>();
  for (const row of (data ?? []) as unknown as { student_id: string; is_present: boolean }[]) {
    const bucket = counts.get(row.student_id) ?? { present: 0, total: 0 };
    bucket.total += 1;
    if (row.is_present) bucket.present += 1;
    counts.set(row.student_id, bucket);
  }
  for (const [studentId, { present, total }] of counts) {
    rates.set(studentId, Math.round((present / total) * 1000) / 10);
  }
  return rates;
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
  if (assessmentId) query = query.eq("assessment_id", assessmentId);

  // The term narrows by submission date, not by assessment.term_id — see
  // inTerm(). A term belonging to another school is treated as matching
  // nothing rather than ignored, so a mismatched filter cannot quietly widen
  // the result to the whole year.
  //
  // When no termId is given, the CURRENT term is resolved anyway rather than
  // left unbounded — every entry here is blended with attendance, and
  // attendance is inherently per-term (attendance_sessions.term_id). Blending
  // a whole academic year of assessments against just this term's attendance
  // would mix two different windows into one number. A school that has not
  // defined its current term falls back to the old unbounded behaviour, with
  // no attendance blend, rather than failing.
  let term: TermWindow | null = null;
  if (termId) {
    term = await getTermWindow(termId);
    if (!term || term.school_id !== schoolId) return [];
    query = query.gte("submitted_at", term.starts_on).lt("submitted_at", nextDay(term.ends_on));
  } else {
    const currentTermId = await getCurrentTermId(schoolId);
    if (currentTermId) term = await getTermWindow(currentTermId);
    if (term) query = query.gte("submitted_at", term.starts_on).lt("submitted_at", nextDay(term.ends_on));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as SubmissionAggRow[];

  const byStudent = new Map<string, { name: string; systemId: string | null; percentages: number[] }>();
  for (const row of rows) {
    if (!isRankable(row)) continue;
    if (term && !inTerm(term, row.submitted_at)) continue;
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

  const attendanceRates = term
    ? await getAttendanceRatesForTerm(Array.from(byStudent.keys()), term.id)
    : new Map<string, number>();

  const entries: Omit<LeaderboardEntry, "rank">[] = Array.from(byStudent.entries()).map(([studentId, agg]) => {
    const written = Math.round((agg.percentages.reduce((sum, p) => sum + p, 0) / agg.percentages.length) * 10) / 10;
    const blend = blendWithAttendance(written, attendanceRates.get(studentId) ?? null);
    return {
      studentId,
      studentName: agg.name,
      studentSystemId: agg.systemId,
      assessmentsCount: agg.percentages.length,
      averagePercentage: blend.overall,
      written: blend.written,
      attendanceRate: blend.attendanceRate,
      attendanceWeight: blend.weight,
    };
  });

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
  submitted_at: string;
  enrollment: { school_id: string; academic_year_id: string } | null;
  assessment: { deleted_at: string | null } | null;
}

const STUDENT_TREND_COLUMNS =
  "total_score, max_score, status, submitted_at, " +
  "enrollment:enrollments!inner(school_id, academic_year_id), " +
  "assessment:assessments!inner(deleted_at)";

/**
 * A student's own average percentage per term, oldest first — their own
 * data only, already fully visible to them today via "My Results", so this
 * is not a new privacy surface. Used to build a term-over-term encouragement
 * message for students outside the top 3, never a comparison to classmates.
 *
 * The term is resolved from the SUBMISSION, not from assessments.term_id.
 * That column has never been populated on any row and cannot be: an
 * assessment is targeted via assessment_targets and may span several schools
 * (or none at all, meaning every school), while terms are per-school, so a
 * multi-school assessment has no single correct term. Reading it meant this
 * function returned an empty array for every student and the encouragement
 * message was permanently stuck on its "no marked results yet" branch.
 *
 * A submission is unambiguous by comparison — enrollment_id resolves to
 * exactly one school, and submitted_at to one date — so the term is looked up
 * the same way term_for_date() does it in SQL: containment between starts_on
 * and ends_on. Resolving per submission also keeps a student who transferred
 * mid-year attributed to the term of the school they actually sat in.
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
  const scored = rows.filter(
    (row) => isRankable(row) && row.enrollment && row.enrollment.academic_year_id === yearId
  );
  if (scored.length === 0) return [];

  // One lookup for every school this student sat in, rather than one per
  // submission — a transfer makes that more than one school, but never many.
  const schoolIds = Array.from(new Set(scored.map((row) => row.enrollment!.school_id)));
  const { data: termRows, error: termError } = await supabase
    .from("terms")
    .select("id, number, school_id, starts_on, ends_on")
    .in("school_id", schoolIds)
    .eq("academic_year_id", yearId);
  if (termError) throw new Error(termError.message);

  const terms = termRows ?? [];
  const byTerm = new Map<string, { number: number; percentages: number[] }>();
  for (const row of scored) {
    const submittedOn = row.submitted_at.slice(0, 10);
    const term = terms.find(
      (t) => t.school_id === row.enrollment!.school_id && t.starts_on <= submittedOn && submittedOn <= t.ends_on
    );
    // A submission outside every defined term is dropped rather than lumped
    // into the nearest one — a school that has not defined its terms yet
    // should show no term trend, not a fabricated one.
    if (!term) continue;
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

/**
 * The term containing today for one school — terms have no app-side "current"
 * flag, unlike academic years, so this mirrors the schema's own definition of
 * "current" exactly: term_for_date() in scripts/schema/01-core.sql resolves a
 * date to a term via `starts_on <= date <= ends_on`, a containment check, not
 * "whichever term most recently started." Matching it keeps this function
 * agreeing with the rest of the app (e.g. lesson_reports.term_id) about what
 * "the current term" means.
 */
export async function getCurrentTermId(schoolId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("terms")
    .select("id")
    .eq("school_id", schoolId)
    .lte("starts_on", today)
    .gte("ends_on", today)
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.id ?? null;
}

export interface StudentTermPerformance {
  termId: string;
  termNumber: number;
  written: number;
  attendanceRate: number | null;
  weight: number;
  overall: number;
}

/**
 * One learner's own current-term blended performance — written assessments
 * and attendance, same 50/50 blend as the leaderboards (see
 * blendWithAttendance), for their own report. Null when there is no current
 * term for their school, or nothing marked yet this term to build a written
 * figure from — same "no number beats a misleading one" rule the rest of this
 * feature follows, not a fabricated 0.
 */
export async function getStudentCurrentTermPerformance(studentId: string): Promise<StudentTermPerformance | null> {
  const supabase = getSupabaseAdmin();
  const { data: enrollment, error } = await supabase
    .from("current_enrollments")
    .select("school_id, academic_year_id")
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!enrollment?.school_id) return null;

  const termId = await getCurrentTermId(enrollment.school_id);
  if (!termId) return null;

  const termAverages = await getStudentTermAverages(studentId, enrollment.academic_year_id ?? undefined);
  const current = termAverages.find((t) => t.termId === termId);
  if (!current) return null;

  const attendanceRates = await getAttendanceRatesForTerm([studentId], termId);
  const blend = blendWithAttendance(current.averagePercentage, attendanceRates.get(studentId) ?? null);

  return {
    termId,
    termNumber: current.termNumber,
    written: blend.written,
    attendanceRate: blend.attendanceRate,
    weight: blend.weight,
    overall: blend.overall,
  };
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
  submitted_at: string;
  enrollment: { school_id: string; school: { name: string } | null } | null;
}

// Deliberately no student profile join — a super-admin comparing schools
// doesn't need any student's name, so the query can't return one. This is the
// actual privacy boundary for the cross-school view, not a later field-strip.
const BENCHMARK_COLUMNS =
  "student_id, total_score, max_score, status, submitted_at, enrollment:enrollments!inner(school_id, academic_year_id, school:schools(name)), assessment:assessments!inner(id, deleted_at)";

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

  if (assessmentId) query = query.eq("assessment_id", assessmentId);

  // "Term II" means each school's OWN Term II, not one school's dates imposed
  // on everyone. The schools do not sit their terms on the same days —
  // Ebenezer's Term 2 ends 12 August and Little Pine's on the 21st — so a
  // single date window would judge one school on nine days of work the other
  // never had, in a view whose entire purpose is comparing them fairly.
  //
  // So the selected term is resolved to its NUMBER, and every school is then
  // matched against its own term of that number. A school that has not defined
  // that term contributes nothing rather than being compared on a guess.
  const termsBySchool = new Map<string, TermWindow>();
  if (termId) {
    const selected = await getTermWindow(termId);
    if (!selected) return [];
    const { data: peers, error: termError } = await supabase
      .from("terms")
      .select("id, number, school_id, starts_on, ends_on")
      .eq("academic_year_id", academicYearId)
      .eq("number", selected.number);
    if (termError) throw new Error(termError.message);
    for (const t of (peers ?? []) as TermWindow[]) termsBySchool.set(t.school_id, t);
    if (termsBySchool.size === 0) return [];

    // Narrow in SQL to the widest window any school uses, so the row count
    // stays bounded; the per-school check below is what makes it exact.
    const windows = Array.from(termsBySchool.values());
    const earliest = windows.reduce((a, t) => (t.starts_on < a ? t.starts_on : a), windows[0].starts_on);
    const latest = windows.reduce((a, t) => (t.ends_on > a ? t.ends_on : a), windows[0].ends_on);
    query = query.gte("submitted_at", earliest).lt("submitted_at", nextDay(latest));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as BenchmarkRow[];

  // Every entry here is blended with attendance (see blendWithAttendance),
  // and attendance is inherently per-term. When no termId was given, each
  // school's OWN current term is resolved instead of leaving the query
  // unbounded — same reasoning as termsBySchool above: a school's Term II
  // is not another school's, so there is no single "current term" that
  // applies across all of them.
  if (!termId) {
    const schoolIds = Array.from(
      new Set(rows.map((r) => r.enrollment?.school_id).filter((id): id is string => !!id))
    );
    const resolved = await Promise.all(
      schoolIds.map(async (id) => {
        const currentId = await getCurrentTermId(id);
        if (!currentId) return null;
        const window = await getTermWindow(currentId);
        return window ? ([id, window] as const) : null;
      })
    );
    for (const entry of resolved) if (entry) termsBySchool.set(entry[0], entry[1]);
  }

  // First pass: per-student average, same as queryLeaderboard, so one
  // prolific test-taker or one heavily-weighted paper doesn't dominate. A
  // school with no resolvable term (explicit or current) contributes nothing,
  // same as the "not defined" case above — never compared on a guess.
  const byStudent = new Map<string, { schoolId: string; schoolName: string; percentages: number[] }>();
  for (const row of rows) {
    if (!isRankable(row) || !row.enrollment) continue;
    const own = termsBySchool.get(row.enrollment.school_id);
    if (!own || !inTerm(own, row.submitted_at)) continue;
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

  // Attendance rates, batched per resolved term (schools may be on different
  // terms), then blended into each student's written average before it is
  // folded into its school's aggregate — same blend as the leaderboards.
  const studentIdsByTerm = new Map<string, string[]>();
  for (const [studentId, agg] of byStudent) {
    const term = termsBySchool.get(agg.schoolId);
    if (!term) continue;
    const list = studentIdsByTerm.get(term.id) ?? [];
    list.push(studentId);
    studentIdsByTerm.set(term.id, list);
  }
  const attendanceRates = new Map<string, number>();
  for (const [scopedTermId, studentIds] of studentIdsByTerm) {
    const rates = await getAttendanceRatesForTerm(studentIds, scopedTermId);
    for (const [studentId, rate] of rates) attendanceRates.set(studentId, rate);
  }

  // Second pass: blend, then group by school.
  const bySchool = new Map<string, { schoolName: string; studentAverages: number[]; submissionsCount: number }>();
  for (const [studentId, { schoolId, schoolName, percentages }] of byStudent) {
    const written = Math.round((percentages.reduce((sum, p) => sum + p, 0) / percentages.length) * 10) / 10;
    const blend = blendWithAttendance(written, attendanceRates.get(studentId) ?? null);
    const existing = bySchool.get(schoolId);
    if (existing) {
      existing.studentAverages.push(blend.overall);
      existing.submissionsCount += percentages.length;
    } else {
      bySchool.set(schoolId, { schoolName, studentAverages: [blend.overall], submissionsCount: percentages.length });
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
