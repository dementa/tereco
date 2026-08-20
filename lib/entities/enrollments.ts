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
/**
 * The enrolment a learner held at a given moment.
 *
 * Needed by offline sync (issue #33): a paper sat in June can reach the server
 * in July, by which time the learner may have been promoted or transferred.
 * Filing that result against `current_enrollments` would put it in a class the
 * paper was never sat in, which is exactly what the enrolment design exists to
 * prevent — see getEnrollmentHistory.
 *
 * Returns null only when the learner has no enrolment at all. When history does
 * not cover the instant (a sitting on the day of a move, say), the caller is
 * expected to fall back rather than reject: a paper that cannot be filed
 * perfectly is still a paper, and refusing it destroys real work.
 */
export async function getEnrollmentAt(
  studentId: string,
  at: number
): Promise<{ enrollmentId: string } | null> {
  const instant = new Date(at).toISOString();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("enrollments")
    .select("id, enrolled_on, exited_on")
    .eq("student_id", studentId)
    .lte("enrolled_on", instant)
    .order("enrolled_on", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as { id: string; exited_on: string | null }[];
  const covering = rows.find((row) => !row.exited_on || row.exited_on >= instant);

  return covering ? { enrollmentId: covering.id } : null;
}

export function enrollmentClassLabel(enrollment: CurrentEnrollment | null): string {
  if (!enrollment) return "";
  return [enrollment.classDisplayName, enrollment.streamName].filter(Boolean).join(" ");
}

export interface RosterEntry {
  enrollmentId: string;
  studentId: string;
  systemId: string | null;
  name: string;
}

/**
 * Who is currently enrolled in one class (and stream, if given) — the roster
 * a teacher takes attendance against. Reads through current_enrollments, same
 * as everywhere else placement is needed, so a promoted or transferred
 * learner simply stops appearing rather than needing separate cleanup.
 *
 * No streamId means "every stream", not "only the unstreamed" — a class that
 * has streams still has every enrollment carrying one, so filtering to a null
 * stream_id here used to return an empty roster for any streamed class picked
 * with "All streams".
 */
export async function listClassRoster(
  classId: string,
  streamId?: string | null
): Promise<RosterEntry[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("current_enrollments")
    // Named explicitly: current_enrollments carries both enrollments_student_id_fkey
    // and enrollments_created_by_fkey into profiles, so an unqualified
    // `profiles(...)` embed is ambiguous to PostgREST (PGRST201) — the
    // student, never whoever recorded the enrollment, is what a roster means.
    .select("id, student_id, student:profiles!enrollments_student_id_fkey(system_id, first_name, middle_name, last_name)")
    .eq("class_id", classId);
  if (streamId) query = query.eq("stream_id", streamId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  interface Row {
    id: string | null;
    student_id: string | null;
    student: { system_id: string | null; first_name: string; middle_name: string | null; last_name: string } | null;
  }

  return (data as unknown as Row[])
    .filter((row): row is Row & { id: string; student_id: string } => !!row.id && !!row.student_id)
    .map((row) => ({
      enrollmentId: row.id,
      studentId: row.student_id,
      systemId: row.student?.system_id ?? null,
      name: [row.student?.first_name, row.student?.middle_name, row.student?.last_name]
        .filter(Boolean)
        .join(" "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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

export interface EnrollmentSearchResult {
  enrollmentId: string;
  studentId: string;
  systemId: string | null;
  name: string;
  schoolName: string | null;
  className: string | null;
  streamName: string | null;
}

/**
 * Find a student by name or system ID, anywhere — for picking one-off
 * individuals (a transfer student, a scattered handful from different
 * classes) onto a list that a class/stream roster wouldn't naturally cover.
 * Returns only students with a CURRENT enrollment; one with none has
 * nothing to enter marks against yet.
 */
export async function searchCurrentEnrollments(query: string, limit = 20): Promise<EnrollmentSearchResult[]> {
  // Commas and parentheses are PostgREST's own or()-list syntax — left
  // unescaped, a name containing one would silently split into an extra
  // clause instead of matching literally. Stripped rather than escaped:
  // no real name needs them, and the search is still useful without.
  const needle = query.trim().replace(/[(),]/g, "");
  if (!needle) return [];

  const supabase = getSupabaseAdmin();
  const { data: matches, error: matchError } = await supabase
    .from("profiles")
    .select("id, system_id, first_name, middle_name, last_name")
    .eq("role", "student")
    .eq("is_active", true)
    .or(`system_id.ilike.%${needle}%,first_name.ilike.%${needle}%,last_name.ilike.%${needle}%`)
    .limit(limit);
  if (matchError) throw new Error(matchError.message);
  if (!matches || matches.length === 0) return [];

  const { data: enrollments, error: enrollError } = await supabase
    .from("current_enrollments")
    .select(
      "id, student_id, school:schools(name), class:classes(alias, grade_level:grade_levels(code)), stream:streams(name)"
    )
    .in(
      "student_id",
      matches.map((m) => m.id)
    );
  if (enrollError) throw new Error(enrollError.message);

  interface EnrollmentRow {
    id: string;
    student_id: string;
    school: { name: string } | null;
    class: { alias: string | null; grade_level: { code: string } | null } | null;
    stream: { name: string } | null;
  }
  const byStudent = new Map((enrollments as unknown as EnrollmentRow[]).map((e) => [e.student_id, e]));

  const results: EnrollmentSearchResult[] = [];
  for (const m of matches) {
    const enrollment = byStudent.get(m.id);
    if (!enrollment) continue;
    results.push({
      enrollmentId: enrollment.id,
      studentId: m.id,
      systemId: m.system_id,
      name: [m.first_name, m.middle_name, m.last_name].filter(Boolean).join(" "),
      schoolName: enrollment.school?.name ?? null,
      className: enrollment.class?.alias ?? enrollment.class?.grade_level?.code ?? null,
      streamName: enrollment.stream?.name ?? null,
    });
  }
  return results;
}
