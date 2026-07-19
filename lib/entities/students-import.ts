import { getSupabaseAdmin } from "@/lib/supabase";
import { generateSystemId } from "@/lib/idGenerator";
import { createAccount } from "@/lib/entities/accounts";

export interface ImportRow {
  firstName: string;
  middleName?: string;
  lastName: string;
  school: string;
  class: string;
  stream?: string;
  dateOfBirth?: string;
  email?: string;
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

async function findExistingStudent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  firstName: string,
  lastName: string,
  classId: string,
  streamId: string | undefined
): Promise<{ systemId: string | null } | null> {
  let query = supabase
    .from("profiles")
    .select("system_id")
    .eq("role", "student")
    .ilike("first_name", firstName.trim())
    .ilike("last_name", lastName.trim())
    .eq("class_id", classId);

  query = streamId ? query.eq("stream_id", streamId) : query.is("stream_id", null);

  const { data } = await query.maybeSingle();
  return data ? { systemId: data.system_id } : null;
}

async function resolveSchool(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  name: string,
  createdBy: string
): Promise<{ id: string }> {
  const trimmed = name.trim();
  const { data: existing } = await supabase.from("schools").select("id").ilike("name", trimmed).maybeSingle();
  if (existing) return existing;

  const systemId = await generateSystemId("school");
  const { data: created, error } = await supabase
    .from("schools")
    .insert({ system_id: systemId, name: trimmed, classes: [], created_by: createdBy })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const { data: retry } = await supabase.from("schools").select("id").ilike("name", trimmed).single();
    if (retry) return retry;
  }
  if (error || !created) throw new Error(error?.message ?? "Failed to create school");
  return created;
}

async function resolveClass(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  schoolId: string,
  name: string,
  wantsStreams: boolean,
  createdBy: string
): Promise<{ id: string; hasStreams: boolean; promoted: boolean }> {
  const trimmed = name.trim();
  const { data: existing } = await supabase
    .from("classes")
    .select("id, has_streams")
    .eq("school_id", schoolId)
    .ilike("name", trimmed)
    .maybeSingle();

  if (existing) {
    if (wantsStreams && !existing.has_streams) {
      await supabase.from("classes").update({ has_streams: true }).eq("id", existing.id);
      return { id: existing.id, hasStreams: true, promoted: true };
    }
    return { id: existing.id, hasStreams: existing.has_streams, promoted: false };
  }

  const { data: created, error } = await supabase
    .from("classes")
    .insert({ school_id: schoolId, name: trimmed, has_streams: wantsStreams, created_by: createdBy })
    .select("id, has_streams")
    .single();
  if (error?.code === "23505") {
    const { data: retry } = await supabase
      .from("classes")
      .select("id, has_streams")
      .eq("school_id", schoolId)
      .ilike("name", trimmed)
      .single();
    if (retry) return { id: retry.id, hasStreams: retry.has_streams, promoted: false };
  }
  if (error || !created) throw new Error(error?.message ?? "Failed to create class");
  return { id: created.id, hasStreams: created.has_streams, promoted: false };
}

async function resolveStream(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  classId: string,
  name: string,
  createdBy: string
): Promise<{ id: string }> {
  const trimmed = name.trim();
  const { data: existing } = await supabase.from("streams").select("id").eq("class_id", classId).ilike("name", trimmed).maybeSingle();
  if (existing) return existing;

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
 * Processes one bulk-import row: resolves (auto-creating as needed) the
 * school/class/stream, then provisions the student account. Rows are
 * processed one at a time by the caller (not concurrently) — auto-create
 * races on the same new class/stream are handled via unique-index
 * conflict + retry above, but sequential processing avoids relying on that
 * as the only guard.
 */
export async function processImportRow(row: ImportRow, rowNumber: number, createdBy: string): Promise<ImportRowResult> {
  const supabase = getSupabaseAdmin();
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ") || `Row ${rowNumber}`;

  try {
    if (!row.firstName?.trim() || !row.lastName?.trim()) {
      return { row: rowNumber, name, status: "error", error: "First name and last name are required." };
    }
    if (!row.school?.trim()) return { row: rowNumber, name, status: "error", error: "School is required." };
    if (!row.class?.trim()) return { row: rowNumber, name, status: "error", error: "Class is required." };

    const school = await resolveSchool(supabase, row.school, createdBy);
    const wantsStreams = !!row.stream?.trim();
    const cls = await resolveClass(supabase, school.id, row.class, wantsStreams, createdBy);

    if (cls.hasStreams && !wantsStreams) {
      return { row: rowNumber, name, status: "error", error: `Class "${row.class}" has streams — a stream is required.` };
    }

    let streamId: string | undefined;
    let note: string | undefined;
    if (wantsStreams) {
      const stream = await resolveStream(supabase, cls.id, row.stream!, createdBy);
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
      schoolId: school.id,
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
