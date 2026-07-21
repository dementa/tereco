import { getSupabaseAdmin } from "@/lib/supabase";
import { UserFacingError } from "@/lib/apiResponse";

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

export type EnrollmentMove = "transfer" | "promote" | "repeat" | "withdraw";

export interface EnrollmentHistoryEntry {
  id: string;
  schoolName: string;
  className: string;
  streamName: string | null;
  academicYear: string;
  status: string;
  enrolledOn: string;
  exitedOn: string | null;
  exitReason: string | null;
}

/**
 * A student's whole placement history, newest first.
 *
 * This is the record the enrolment design exists to protect: every past class
 * with the dates they were in it, so a result from two years ago still resolves
 * to the class they actually sat it in.
 */
export async function getEnrollmentHistory(
  studentId: string
): Promise<EnrollmentHistoryEntry[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("enrollments")
    .select(
      "id, status, enrolled_on, exited_on, exit_reason, school:schools(name), class:classes(alias, grade_level:grade_levels(code)), stream:streams(name), year:academic_years(label)"
    )
    .eq("student_id", studentId)
    .order("enrolled_on", { ascending: false });
  if (error) throw new Error(error.message);

  interface Row {
    id: string;
    status: string;
    enrolled_on: string;
    exited_on: string | null;
    exit_reason: string | null;
    school: { name: string } | null;
    class: { alias: string | null; grade_level: { code: string } | null } | null;
    stream: { name: string } | null;
    year: { label: string } | null;
  }

  return (data as unknown as Row[]).map((row) => ({
    id: row.id,
    schoolName: row.school?.name ?? "",
    className: row.class?.alias ?? row.class?.grade_level?.code ?? "",
    streamName: row.stream?.name ?? null,
    academicYear: row.year?.label ?? "",
    status: row.status,
    enrolledOn: row.enrolled_on,
    exitedOn: row.exited_on,
    exitReason: row.exit_reason,
  }));
}

const CLOSING_STATUS: Record<EnrollmentMove, string> = {
  transfer: "transferred_out",
  promote: "completed",
  repeat: "completed",
  withdraw: "withdrawn",
};

/**
 * Moves a student: closes their open span and, unless they are leaving, opens
 * the next one.
 *
 * `exited_on` is EXCLUSIVE in the range the database excludes on
 * (`daterange(enrolled_on, exited_on, '[)')`), so a move effective on date D
 * closes the old span at D and opens the new one on D. They are never in two
 * places, and never in none.
 *
 * Placement is never edited in place. Rewriting the current row would change
 * which class every past record belongs to, which is the exact failure the
 * dated spans exist to prevent.
 */
export async function moveStudent(input: {
  studentId: string;
  move: EnrollmentMove;
  effectiveDate: string;
  /** Required for everything except a withdrawal. */
  toSchoolId?: string;
  toClassId?: string;
  toStreamId?: string | null;
  academicYearId?: string;
  reason?: string;
  createdBy: string;
}): Promise<{ closed: string; opened: string | null }> {
  const supabase = getSupabaseAdmin();

  const { data: open, error: readError } = await supabase
    .from("current_enrollments")
    .select("id, school_id, class_id, enrolled_on")
    .eq("student_id", input.studentId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!open?.id) {
    throw new UserFacingError(
      "This student has no open enrolment, so there is nothing to move. Enrol them first."
    );
  }

  if (input.effectiveDate < (open.enrolled_on ?? "")) {
    throw new UserFacingError(
      `The move date cannot be before they joined their current class (${open.enrolled_on}).`
    );
  }

  const leaving = input.move === "withdraw";
  if (!leaving && !input.toClassId) {
    throw new UserFacingError("Choose the class they are moving into.");
  }

  const { error: closeError } = await supabase
    .from("enrollments")
    .update({
      exited_on: input.effectiveDate,
      status: CLOSING_STATUS[input.move],
      exit_reason: input.reason ?? null,
    })
    .eq("id", open.id);
  if (closeError) throw new Error(closeError.message);

  if (leaving) return { closed: open.id, opened: null };

  const academicYearId = input.academicYearId ?? (await currentAcademicYearId());

  const { data: opened, error: openError } = await supabase
    .from("enrollments")
    .insert({
      student_id: input.studentId,
      school_id: input.toSchoolId ?? open.school_id!,
      class_id: input.toClassId!,
      stream_id: input.toStreamId ?? null,
      academic_year_id: academicYearId,
      status: input.move === "repeat" ? "repeating" : "active",
      enrolled_on: input.effectiveDate,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (openError) {
    // Reopen the old span rather than leaving the student enrolled nowhere,
    // which would hide them from every class list and block them sitting papers.
    await supabase
      .from("enrollments")
      .update({ exited_on: null, status: "active", exit_reason: null })
      .eq("id", open.id);

    if (openError.code === "23P01") {
      throw new UserFacingError(
        "That would overlap an existing enrolment for this student. Check the move date."
      );
    }
    if (openError.code === "23503") {
      throw new UserFacingError("The chosen class or stream no longer exists — refresh and try again.");
    }
    throw new Error(openError.message);
  }

  return { closed: open.id, opened: opened.id };
}

async function currentAcademicYearId(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("academic_years")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new UserFacingError(
      "No academic year is marked as current — set one before moving students."
    );
  }
  return data.id;
}

export interface BulkMoveResult {
  moved: number;
  failures: { student: string; reason: string }[];
}

/**
 * Promotes everyone currently in one class into another — the end-of-year move,
 * which is otherwise thirty identical operations done by hand.
 *
 * Each student is moved independently and failures are collected, so one
 * problem child does not strand the rest of the class half-promoted.
 */
export async function promoteClass(input: {
  fromClassId: string;
  toClassId: string;
  toStreamId?: string | null;
  effectiveDate: string;
  academicYearId?: string;
  createdBy: string;
}): Promise<BulkMoveResult> {
  const supabase = getSupabaseAdmin();

  const { data: enrolled, error } = await supabase
    .from("current_enrollments")
    .select("student_id, school_id")
    .eq("class_id", input.fromClassId);
  if (error) throw new Error(error.message);

  const result: BulkMoveResult = { moved: 0, failures: [] };

  for (const row of enrolled ?? []) {
    if (!row.student_id) continue;
    try {
      await moveStudent({
        studentId: row.student_id,
        move: "promote",
        effectiveDate: input.effectiveDate,
        toSchoolId: row.school_id ?? undefined,
        toClassId: input.toClassId,
        toStreamId: input.toStreamId ?? null,
        academicYearId: input.academicYearId,
        createdBy: input.createdBy,
      });
      result.moved += 1;
    } catch (e) {
      const { data: who } = await supabase
        .from("profiles")
        .select("system_id, first_name, last_name")
        .eq("id", row.student_id)
        .maybeSingle();
      result.failures.push({
        student: who ? `${who.first_name} ${who.last_name} (${who.system_id})` : row.student_id,
        reason: e instanceof Error ? e.message : "Move failed",
      });
    }
  }

  return result;
}
