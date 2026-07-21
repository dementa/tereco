import { getSupabaseAdmin } from "@/lib/supabase";

export interface CurrentEnrollment {
  enrollmentId: string;
  schoolId: string;
  classId: string;
  streamId: string | null;
  academicYearId: string;
  level: number | null;
  /** What this school calls the class — its alias, else the canonical P.n code. */
  classDisplayName: string;
  streamName: string | null;
}

/**
 * Resolves a student's CURRENT placement.
 *
 * There is deliberately no `class_name` column on profiles. A student can be
 * promoted or change school at any time, and a column would silently rewrite
 * which class their historical records belong to. Placement is always read
 * through the open enrollment span instead.
 *
 * Returns null when the student has no open enrollment — a real state
 * (withdrawn, or imported but not yet enrolled), not an error.
 */
export async function getCurrentEnrollment(
  studentId: string
): Promise<CurrentEnrollment | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("current_enrollments")
    .select("id, school_id, class_id, stream_id, academic_year_id, level, class_display_name, stream_name")
    .eq("student_id", studentId)
    .maybeSingle();

  if (error || !data) return null;

  // Postgres does not propagate NOT NULL through a view, so the generated types
  // mark every column of `current_enrollments` nullable even though these four
  // are NOT NULL on `enrollments` and reached through an inner join. Rather than
  // assert that away, check it: a row that somehow lacks them is not a placement
  // we can use, and returning null is already a state every caller handles.
  if (
    data.id === null ||
    data.school_id === null ||
    data.class_id === null ||
    data.academic_year_id === null
  ) {
    return null;
  }

  return {
    enrollmentId: data.id,
    schoolId: data.school_id,
    classId: data.class_id,
    streamId: data.stream_id,
    academicYearId: data.academic_year_id,
    level: data.level,
    classDisplayName: data.class_display_name ?? "",
    streamName: data.stream_name,
  };
}

/** Full class label including stream, e.g. "P.4 Bright". */
export function enrollmentClassLabel(enrollment: CurrentEnrollment | null): string {
  if (!enrollment) return "";
  return [enrollment.classDisplayName, enrollment.streamName].filter(Boolean).join(" ");
}
