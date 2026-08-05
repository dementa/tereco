import { getSupabaseAdmin } from "./supabase";

/**
 * Attendance is taken standalone, before a lesson report exists — this file
 * is where a session's per-learner rows are written, listed, and later
 * claimed by exactly one lesson report. See app/api/lesson/route.ts for the
 * claim side of that handshake.
 */

export interface AttendanceEntryInput {
  studentId: string;
  enrollmentId: string;
  present: boolean;
}

function countPresentAbsent(rows: { is_present: boolean }[]) {
  const present = rows.filter((r) => r.is_present).length;
  return { present, absent: rows.length - present };
}

export interface AttendanceSessionRecord {
  id: string;
  school: string;
  className: string;
  streamName: string;
  sessionDate: string;
  period: number;
  present: number;
  absent: number;
  takenAt: string;
  attached: boolean;
  lessonReportReference: string | null;
}

interface SessionRow {
  id: string;
  session_date: string;
  period: number;
  taken_at: string;
  lesson_report_id: string | null;
  school: { name: string } | null;
  class: { level: number | null; alias: string | null; grade_level: { code: string } | null } | null;
  stream: { name: string } | null;
  lesson_report: { reference: string } | null;
}

const SESSION_COLUMNS =
  "id, session_date, period, taken_at, lesson_report_id, school:schools(name), class:classes(level, alias, grade_level:grade_levels(code)), stream:streams(name), lesson_report:lesson_reports(reference)";

/** The current teacher's own attendance sessions, newest first — for the /staff/attendance history page. */
/** Attaches present/absent counts to each session row, keyed off its own attendance rows. */
async function sessionsWithCounts(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rows: SessionRow[]
): Promise<AttendanceSessionRecord[]> {
  if (rows.length === 0) return [];

  const { data: attendanceRows, error: attendanceError } = await supabase
    .from("lesson_attendance")
    .select("attendance_session_id, is_present")
    .in(
      "attendance_session_id",
      rows.map((r) => r.id)
    );
  if (attendanceError) throw new Error(attendanceError.message);

  const bySession = new Map<string, { is_present: boolean }[]>();
  for (const row of attendanceRows as unknown as { attendance_session_id: string; is_present: boolean }[]) {
    const list = bySession.get(row.attendance_session_id) ?? [];
    list.push({ is_present: row.is_present });
    bySession.set(row.attendance_session_id, list);
  }

  return rows.map((row) => {
    const { present, absent } = countPresentAbsent(bySession.get(row.id) ?? []);
    return {
      id: row.id,
      school: row.school?.name ?? "",
      className: row.class?.alias ?? row.class?.grade_level?.code ?? "",
      streamName: row.stream?.name ?? "",
      sessionDate: row.session_date,
      period: row.period,
      present,
      absent,
      takenAt: row.taken_at,
      attached: row.lesson_report_id !== null,
      lessonReportReference: row.lesson_report?.reference ?? null,
    };
  });
}

export async function getAttendanceSessions(filters: {
  staffId: string;
  limit?: number;
}): Promise<AttendanceSessionRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("attendance_sessions")
    .select(SESSION_COLUMNS)
    .eq("staff_id", filters.staffId)
    .order("session_date", { ascending: false })
    .order("taken_at", { ascending: false })
    .limit(filters.limit ?? 200);
  if (error) throw new Error(error.message);

  return sessionsWithCounts(supabase, data as unknown as SessionRow[]);
}

export interface StudentAttendanceRecord {
  id: string;
  sessionDate: string;
  period: number;
  className: string;
  streamName: string;
  present: boolean;
}

interface StudentAttendanceRow {
  id: string;
  is_present: boolean;
  session: {
    session_date: string;
    period: number;
    class: { alias: string | null; grade_level: { code: string } | null } | null;
    stream: { name: string } | null;
  } | null;
}

/** One child's own attendance history, newest first — for the parent portal. */
export async function getAttendanceForStudent(
  studentId: string,
  limit = 200
): Promise<StudentAttendanceRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("lesson_attendance")
    .select(
      "id, is_present, session:attendance_sessions(session_date, period, class:classes(alias, grade_level:grade_levels(code)), stream:streams(name))"
    )
    .eq("student_id", studentId)
    .not("attendance_session_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return (data as unknown as StudentAttendanceRow[])
    .filter((row) => row.session !== null)
    .map((row) => {
      const session = row.session!;
      return {
        id: row.id,
        sessionDate: session.session_date,
        period: session.period,
        className: session.class?.alias ?? session.class?.grade_level?.code ?? "",
        streamName: session.stream?.name ?? "",
        present: row.is_present,
      };
    });
}

/** Every class's sessions at one school, newest first — for the school-admin oversight page. */
export async function getSchoolAttendanceSessions(
  schoolId: string,
  limit?: number
): Promise<AttendanceSessionRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("attendance_sessions")
    .select(SESSION_COLUMNS)
    .eq("school_id", schoolId)
    .order("session_date", { ascending: false })
    .order("taken_at", { ascending: false })
    .limit(limit ?? 200);
  if (error) throw new Error(error.message);

  return sessionsWithCounts(supabase, data as unknown as SessionRow[]);
}

export interface AvailableAttendanceSession {
  id: string;
  takenAt: string;
  present: number;
  absent: number;
}

/**
 * This teacher's own unattached sessions for one exact slot — what the
 * lesson report's attendance step auto-matches or picks from. Never returns
 * another teacher's sessions, and never returns one already claimed by a
 * report.
 */
export async function getAvailableAttendanceSessions(params: {
  staffId: string;
  classId: string;
  streamId: string | null;
  date: string;
  period: number;
}): Promise<AvailableAttendanceSession[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("attendance_sessions")
    .select("id, taken_at")
    .eq("staff_id", params.staffId)
    .eq("class_id", params.classId)
    .eq("session_date", params.date)
    .eq("period", params.period)
    .is("lesson_report_id", null)
    .order("taken_at", { ascending: false });

  query = params.streamId ? query.eq("stream_id", params.streamId) : query.is("stream_id", null);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data as unknown as { id: string; taken_at: string }[];
  if (rows.length === 0) return [];

  const { data: attendanceRows, error: attendanceError } = await supabase
    .from("lesson_attendance")
    .select("attendance_session_id, is_present")
    .in(
      "attendance_session_id",
      rows.map((r) => r.id)
    );
  if (attendanceError) throw new Error(attendanceError.message);

  const bySession = new Map<string, { is_present: boolean }[]>();
  for (const row of attendanceRows as unknown as { attendance_session_id: string; is_present: boolean }[]) {
    const list = bySession.get(row.attendance_session_id) ?? [];
    list.push({ is_present: row.is_present });
    bySession.set(row.attendance_session_id, list);
  }

  return rows.map((row) => {
    const { present, absent } = countPresentAbsent(bySession.get(row.id) ?? []);
    return { id: row.id, takenAt: row.taken_at, present, absent };
  });
}

/**
 * Creates a standalone attendance session plus its per-learner rows. Not
 * attached to any lesson report yet — that happens later, if and when a
 * report claims it (see claimAttendanceSession below).
 */
export async function createAttendanceSession(input: {
  staffId: string;
  schoolId: string;
  classId: string;
  streamId: string | null;
  date: string;
  period: number;
  /** True when this was a computer-lab lesson, so it gets practical scoring afterwards. */
  isPractical: boolean;
  attendance: AttendanceEntryInput[];
}): Promise<{ id: string; present: number; absent: number }> {
  const supabase = getSupabaseAdmin();

  const { data: session, error } = await supabase
    .from("attendance_sessions")
    .insert({
      staff_id: input.staffId,
      school_id: input.schoolId,
      class_id: input.classId,
      stream_id: input.streamId,
      session_date: input.date,
      period: input.period,
      is_practical: input.isPractical,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (input.attendance.length > 0) {
    const { error: rowsError } = await supabase.from("lesson_attendance").insert(
      input.attendance.map((a) => ({
        attendance_session_id: session.id,
        student_id: a.studentId,
        enrollment_id: a.enrollmentId,
        is_present: a.present,
      }))
    );

    if (rowsError) {
      // A session whose attendance failed to save is worse than no session at
      // all — same reasoning as the lesson_reports rollback this replaces.
      await supabase.from("attendance_sessions").delete().eq("id", session.id);
      throw rowsError;
    }
  }

  const { present, absent } = countPresentAbsent(
    input.attendance.map((a) => ({ is_present: a.present }))
  );
  return { id: session.id, present, absent };
}

export type AttachOutcome =
  | { ok: true; present: number; absent: number }
  | { ok: false; reason: "not_found" | "wrong_owner" | "already_attached" | "slot_mismatch" };

/**
 * Read-only pre-check, run BEFORE the lesson_reports row is inserted — the
 * three failure reasons here are all knowable without a report id yet.
 * Returns the derived present/absent counts on success so the caller never
 * has to trust a client-sent total.
 */
export async function precheckAttendanceSession(params: {
  sessionId: string;
  staffId: string;
  classId: string;
  streamId: string | null;
  date: string;
  period: number;
}): Promise<AttachOutcome> {
  const supabase = getSupabaseAdmin();
  const { data: session, error } = await supabase
    .from("attendance_sessions")
    .select("id, staff_id, class_id, stream_id, session_date, period, lesson_report_id")
    .eq("id", params.sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!session) return { ok: false, reason: "not_found" };
  if (session.staff_id !== params.staffId) return { ok: false, reason: "wrong_owner" };
  if (session.lesson_report_id !== null) return { ok: false, reason: "already_attached" };
  if (
    session.class_id !== params.classId ||
    (session.stream_id ?? null) !== (params.streamId ?? null) ||
    session.session_date !== params.date ||
    session.period !== params.period
  ) {
    return { ok: false, reason: "slot_mismatch" };
  }

  const { data: attendanceRows, error: attendanceError } = await supabase
    .from("lesson_attendance")
    .select("is_present")
    .eq("attendance_session_id", params.sessionId);
  if (attendanceError) throw new Error(attendanceError.message);

  const { present, absent } = countPresentAbsent(
    attendanceRows as unknown as { is_present: boolean }[]
  );
  return { ok: true, present, absent };
}

/**
 * The atomic claim, run AFTER the lesson_reports row exists. The conditional
 * `is("lesson_report_id", null)` is what makes this safe against two
 * concurrent submits racing for the same session — only one UPDATE can ever
 * match a row still sitting at null. Returns false when the race is lost.
 */
export async function claimAttendanceSession(sessionId: string, reportId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("attendance_sessions")
    .update({ lesson_report_id: reportId })
    .eq("id", sessionId)
    .is("lesson_report_id", null)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/** Points the session's per-learner rows at the report that just claimed it. */
export async function linkAttendanceRows(sessionId: string, reportId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("lesson_attendance")
    .update({ lesson_report_id: reportId })
    .eq("attendance_session_id", sessionId);
  if (error) throw new Error(error.message);
}

/** Rollback helper: frees a session back up after a failed attach. */
export async function releaseAttendanceSession(sessionId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("attendance_sessions")
    .update({ lesson_report_id: null })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}
