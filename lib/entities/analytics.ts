import { getSupabaseAdmin } from "@/lib/supabase";

// Current enrollment = active/repeating with no exit date, matching the
// `current_enrollments` view's own definition (scripts/schema/01-core.sql) —
// queried directly against `enrollments` here (not the view) so profile/class
// joins can be embedded in the same select, which PostgREST doesn't reliably
// support through a view.
function scopeToCurrentEnrollments<T extends { eq: (col: string, val: string) => T; in: (col: string, vals: string[]) => T; is: (col: string, val: null) => T }>(
  query: T,
  schoolId?: string
): T {
  let scoped = query.in("status", ["active", "repeating"]).is("exited_on", null);
  if (schoolId) scoped = scoped.eq("school_id", schoolId);
  return scoped;
}

function studentFullName(
  student: { first_name: string; middle_name: string | null; last_name: string } | null
): string {
  if (!student) return "";
  return [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ").trim();
}

export interface GenderBreakdownEntry {
  gender: "male" | "female" | "unspecified";
  count: number;
}

interface GenderRow {
  student: { gender: string | null } | null;
}

const GENDER_COLUMNS = "student:profiles!enrollments_student_id_fkey(gender)";

/** Current students by gender, scoped to one school or system-wide. Nulls bucket as "unspecified", never dropped. */
export async function getGenderBreakdown(schoolId?: string): Promise<GenderBreakdownEntry[]> {
  const supabase = getSupabaseAdmin();
  const query = scopeToCurrentEnrollments(supabase.from("enrollments").select(GENDER_COLUMNS), schoolId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const counts = { male: 0, female: 0, unspecified: 0 };
  for (const row of (data ?? []) as unknown as GenderRow[]) {
    const gender = row.student?.gender;
    if (gender === "male") counts.male++;
    else if (gender === "female") counts.female++;
    else counts.unspecified++;
  }

  return (
    [
      { gender: "male" as const, count: counts.male },
      { gender: "female" as const, count: counts.female },
      { gender: "unspecified" as const, count: counts.unspecified },
    ] satisfies GenderBreakdownEntry[]
  ).filter((entry) => entry.count > 0);
}

export interface PopulationEntry {
  label: string;
  count: number;
}

interface PopulationRow {
  class: { alias: string | null; grade_level: { code: string } | null } | null;
}

const POPULATION_COLUMNS = "class:classes(alias, grade_level:grade_levels(code))";

/**
 * Current student count per class — same `alias ?? grade_level.code` display
 * rule as classDisplayName in lib/entities/classes.ts. Scoped to one school,
 * or system-wide (in which case same-named classes across schools combine
 * into one grade-level total, which is the useful reading for a super-admin).
 */
export async function getPopulationByClass(schoolId?: string): Promise<PopulationEntry[]> {
  const supabase = getSupabaseAdmin();
  const query = scopeToCurrentEnrollments(supabase.from("enrollments").select(POPULATION_COLUMNS), schoolId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as unknown as PopulationRow[]) {
    const label = row.class?.alias ?? row.class?.grade_level?.code ?? "Other";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export interface ActivityItem {
  type: "enrollment" | "submission";
  label: string;
  timestamp: string;
}

interface EnrollmentActivityRow {
  created_at: string;
  student: { first_name: string; middle_name: string | null; last_name: string } | null;
  class: { alias: string | null; grade_level: { code: string } | null } | null;
}

interface SubmissionActivityRow {
  submitted_at: string;
  student: { first_name: string; middle_name: string | null; last_name: string } | null;
  assessment: { title: string } | null;
}

const ENROLLMENT_ACTIVITY_COLUMNS =
  "created_at, student:profiles!enrollments_student_id_fkey(first_name, middle_name, last_name), class:classes(alias, grade_level:grade_levels(code))";
const SUBMISSION_ACTIVITY_COLUMNS =
  "submitted_at, student:profiles!assessment_submissions_student_id_fkey(first_name, middle_name, last_name), assessment:assessments!inner(title, deleted_at), enrollment:enrollments!inner(school_id)";

/**
 * A "recent activity" feed built from data already being written today —
 * recent enrollments and recently-marked assessment submissions, merged and
 * sorted by timestamp. Deliberately NOT backed by the `audit_log` table
 * (scripts/schema/02-audit.sql): that table is fully designed but nothing in
 * the app writes to it yet, and wiring every mutation route to log there is
 * a separate, larger effort — not something to fold into a dashboard feed.
 */
export async function getRecentActivity(schoolId?: string, limit = 10): Promise<ActivityItem[]> {
  const supabase = getSupabaseAdmin();

  let enrollmentQuery = supabase
    .from("enrollments")
    .select(ENROLLMENT_ACTIVITY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (schoolId) enrollmentQuery = enrollmentQuery.eq("school_id", schoolId);

  let submissionQuery = supabase
    .from("assessment_submissions")
    .select(SUBMISSION_ACTIVITY_COLUMNS)
    .eq("status", "marked")
    .is("assessment.deleted_at", null)
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (schoolId) submissionQuery = submissionQuery.eq("enrollment.school_id", schoolId);

  const [enrollments, submissions] = await Promise.all([enrollmentQuery, submissionQuery]);
  if (enrollments.error) throw new Error(enrollments.error.message);
  if (submissions.error) throw new Error(submissions.error.message);

  const items: ActivityItem[] = [];

  for (const row of (enrollments.data ?? []) as unknown as EnrollmentActivityRow[]) {
    const name = studentFullName(row.student) || "A student";
    const className = row.class?.alias ?? row.class?.grade_level?.code ?? "a class";
    items.push({ type: "enrollment", label: `${name} joined ${className}`, timestamp: row.created_at });
  }

  for (const row of (submissions.data ?? []) as unknown as SubmissionActivityRow[]) {
    const name = studentFullName(row.student) || "A student";
    const title = row.assessment?.title ?? "an assessment";
    items.push({ type: "submission", label: `${name} completed ${title}`, timestamp: row.submitted_at });
  }

  items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return items.slice(0, limit);
}
