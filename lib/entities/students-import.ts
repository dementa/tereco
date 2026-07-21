import { getSupabaseAdmin } from "@/lib/supabase";
import { UserFacingError } from "@/lib/apiResponse";
import { createAccount } from "@/lib/entities/accounts";

/**
 * One spreadsheet row.
 *
 * There is deliberately NO school column. The school is chosen once, in the
 * UI, and applies to the whole file — a spreadsheet must never be able to
 * bring a school into existence. Previously a name that didn't match simply
 * created one, so a typo silently produced a duplicate school that then could
 * not be merged away.
 */
export interface ImportRow {
  firstName: string;
  middleName?: string;
  lastName: string;
  class: string;
  stream?: string;
  dateOfBirth?: string;
  email?: string;
}

export interface ImportOptions {
  /** The school every row in this file belongs to. */
  schoolId: string;
  /**
   * Off by default. When on, classes and streams named in the file that don't
   * exist yet are created — for genuinely onboarding a new school's structure
   * from their own list. Otherwise an unknown class fails its row and says so.
   */
  allowCreateStructure: boolean;
  createdBy: string;
}

export interface ImportRowResult {
  row: number;
  name: string;
  status: "created" | "skipped" | "error";
  systemId?: string;
  temporaryPassword?: string;
  note?: string; // e.g. "class P.6 was updated to support streams"
  error?: string;
}

/**
 * Two queries rather than one embedded filter: find students with this name,
 * then ask whether any of them is currently enrolled in this class/stream.
 * Placement lives in `enrollments`, so it cannot be filtered on the profile.
 */
async function findExistingStudent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  firstName: string,
  lastName: string,
  classId: string,
  streamId: string | undefined
): Promise<{ systemId: string | null } | null> {
  const { data: candidates } = await supabase
    .from("profiles")
    .select("id, system_id")
    .eq("role", "student")
    .ilike("first_name", firstName.trim())
    .ilike("last_name", lastName.trim());

  if (!candidates || candidates.length === 0) return null;

  let query = supabase
    .from("current_enrollments")
    .select("student_id")
    .eq("class_id", classId)
    .in(
      "student_id",
      candidates.map((c) => c.id)
    );
  query = streamId ? query.eq("stream_id", streamId) : query.is("stream_id", null);

  const { data: enrolled } = await query.limit(1);
  if (!enrolled || enrolled.length === 0) return null;

  const match = candidates.find((c) => c.id === enrolled[0].student_id);
  return match ? { systemId: match.system_id } : null;
}

/** "P.2", "p2", "P 2" all mean the same rung of the ladder. */
function normalizeClassCode(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Maps a spreadsheet class label onto the canonical ladder where it matches a
 * grade level code ("P.2" → level 2), and treats anything else as a school's
 * own named class ("ELITE" → alias, no level).
 */
async function resolveClassIdentity(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  label: string
): Promise<{ level: number | null; alias: string | null }> {
  const trimmed = label.trim();
  const { data: levels, error } = await supabase.from("grade_levels").select("level, code");
  if (error) throw new Error(error.message);

  const target = normalizeClassCode(trimmed);
  const match = (levels ?? []).find((l) => normalizeClassCode(l.code) === target);
  return match ? { level: match.level, alias: null } : { level: null, alias: trimmed };
}

async function resolveClass(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  schoolId: string,
  name: string,
  wantsStreams: boolean,
  createdBy: string,
  allowCreate: boolean
): Promise<{ id: string; hasStreams: boolean; promoted: boolean }> {
  const { level, alias } = await resolveClassIdentity(supabase, name);

  // Ladder classes are unique per (school, level); named ones per (school, alias).
  const findExisting = () => {
    const query = supabase.from("classes").select("id, has_streams").eq("school_id", schoolId);
    return level !== null ? query.eq("level", level) : query.ilike("alias", alias ?? "");
  };

  const { data: existing } = await findExisting().maybeSingle();

  if (existing) {
    if (wantsStreams && !existing.has_streams) {
      await supabase.from("classes").update({ has_streams: true }).eq("id", existing.id);
      return { id: existing.id, hasStreams: true, promoted: true };
    }
    return { id: existing.id, hasStreams: existing.has_streams, promoted: false };
  }

  if (!allowCreate) {
    throw new UserFacingError(
      `Class "${name.trim()}" does not exist at this school. Create it first, or tick "create missing classes and streams".`
    );
  }

  const { data: created, error } = await supabase
    .from("classes")
    .insert({ school_id: schoolId, level, alias, has_streams: wantsStreams, created_by: createdBy })
    .select("id, has_streams")
    .single();
  if (error?.code === "23505") {
    const { data: retry } = await findExisting().single();
    if (retry) return { id: retry.id, hasStreams: retry.has_streams, promoted: false };
  }
  if (error || !created) throw new Error(error?.message ?? "Failed to create class");
  return { id: created.id, hasStreams: created.has_streams, promoted: false };
}

async function resolveStream(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  classId: string,
  name: string,
  createdBy: string,
  allowCreate: boolean
): Promise<{ id: string }> {
  const trimmed = name.trim();
  const { data: existing } = await supabase.from("streams").select("id").eq("class_id", classId).ilike("name", trimmed).maybeSingle();
  if (existing) return existing;

  if (!allowCreate) {
    throw new UserFacingError(
      `Stream "${trimmed}" does not exist in this class. Create it first, or tick "create missing classes and streams".`
    );
  }

  const { data: created, error } = await supabase
    .from("streams")
    .insert({ class_id: classId, name: trimmed, created_by: createdBy })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const { data: retry } = await supabase.from("streams").select("id").eq("class_id", classId).ilike("name", trimmed).single();
    if (retry) return retry;
  }
  if (error || !created) throw new Error(error?.message ?? "Failed to create stream");
  return created;
}

/**
 * Processes one bulk-import row against an already-chosen school, then
 * provisions the student account.
 *
 * Rows are processed one at a time by the caller (not concurrently): when
 * structure creation is enabled, that avoids two rows racing to create the
 * same class or stream. The unique-index conflict + retry below is the
 * backstop, not the primary guard.
 */
export async function processImportRow(
  row: ImportRow,
  rowNumber: number,
  options: ImportOptions
): Promise<ImportRowResult> {
  const supabase = getSupabaseAdmin();
  const { schoolId, allowCreateStructure, createdBy } = options;
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ") || `Row ${rowNumber}`;

  try {
    if (!row.firstName?.trim() || !row.lastName?.trim()) {
      return { row: rowNumber, name, status: "error", error: "First name and last name are required." };
    }
    if (!row.class?.trim()) return { row: rowNumber, name, status: "error", error: "Class is required." };

    const wantsStreams = !!row.stream?.trim();
    const cls = await resolveClass(
      supabase,
      schoolId,
      row.class,
      wantsStreams,
      createdBy,
      allowCreateStructure
    );

    if (cls.hasStreams && !wantsStreams) {
      return { row: rowNumber, name, status: "error", error: `Class "${row.class}" has streams — a stream is required.` };
    }

    let streamId: string | undefined;
    let note: string | undefined;
    if (wantsStreams) {
      const stream = await resolveStream(supabase, cls.id, row.stream!, createdBy, allowCreateStructure);
      streamId = stream.id;
      if (cls.promoted) note = `Class "${row.class}" was updated to support streams because this row specified stream "${row.stream}".`;
    }

    // Makes the whole import idempotent: safe to re-run the same file (e.g.
    // after fixing a few bad rows) without creating duplicate accounts for
    // students that already succeeded. Matches on name + class + stream —
    // there's no email to key off for most rows.
    const existing = await findExistingStudent(supabase, row.firstName, row.lastName, cls.id, streamId);
    if (existing) {
      return {
        row: rowNumber,
        name,
        status: "skipped",
        systemId: existing.systemId ?? undefined,
        note: `Already exists as ${existing.systemId} (matched by name + class${streamId ? " + stream" : ""}) — skipped, not duplicated.`,
      };
    }

    const account = await createAccount({
      role: "student",
      firstName: row.firstName.trim(),
      middleName: row.middleName?.trim() || undefined,
      lastName: row.lastName.trim(),
      email: row.email?.trim() || undefined,
      dateOfBirth: row.dateOfBirth?.trim() || undefined,
      schoolId,
      classId: cls.id,
      streamId,
      createdBy,
    });

    return {
      row: rowNumber,
      name,
      status: "created",
      systemId: account.systemId,
      temporaryPassword: account.temporaryPassword,
      note,
    };
  } catch (error) {
    return {
      row: rowNumber,
      name,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
