import { getSupabaseAdmin } from "@/lib/supabase";
import { UserFacingError } from "@/lib/apiResponse";

export interface Stream {
  id: string;
  name: string;
}

export interface SchoolClass {
  id: string;
  name: string;
  hasStreams: boolean;
  streams: Stream[];
}

export interface SchoolDirectoryEntry {
  id: string;
  name: string;
  classes: SchoolClass[];
}

interface ClassRow {
  id: string;
  name: string;
  has_streams: boolean;
  streams: { id: string; name: string }[] | null;
}

/** Nested schools -> classes -> streams, for the lesson wizard and any other read-only directory consumer. */
export async function listSchoolsDirectory(): Promise<SchoolDirectoryEntry[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("schools")
    .select("id, name, classes(id, name, has_streams, streams(id, name))")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((school) => ({
    id: school.id,
    name: school.name,
    classes: ((school.classes ?? []) as unknown as ClassRow[])
      .map((c) => ({
        id: c.id,
        name: c.name,
        hasStreams: c.has_streams,
        streams: (c.streams ?? []).map((s) => ({ id: s.id, name: s.name })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export async function listClassesForSchool(schoolId: string): Promise<SchoolClass[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("classes")
    .select("id, name, has_streams, streams(id, name)")
    .eq("school_id", schoolId)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as ClassRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    hasStreams: c.has_streams,
    streams: (c.streams ?? []).map((s) => ({ id: s.id, name: s.name })),
  }));
}

export async function createClass(input: {
  schoolId: string;
  name: string;
  hasStreams: boolean;
  createdBy: string;
}): Promise<SchoolClass> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("classes")
    .insert({
      school_id: input.schoolId,
      name: input.name.trim(),
      has_streams: input.hasStreams,
      created_by: input.createdBy,
    })
    .select("id, name, has_streams")
    .single();

  if (error) throw new Error(error.message);
  return { id: data.id, name: data.name, hasStreams: data.has_streams, streams: [] };
}

export async function updateClass(classId: string, updates: { name?: string; hasStreams?: boolean }): Promise<void> {
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.hasStreams !== undefined) patch.has_streams = updates.hasStreams;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("classes").update(patch).eq("id", classId);
  if (error) throw new Error(error.message);
}

/** Blocked if any student is currently assigned to this class. */
export async function deleteClass(classId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId);

  if (count && count > 0) {
    throw new UserFacingError(`Cannot delete — ${count} student(s) are assigned to this class.`);
  }

  const { error } = await supabase.from("classes").delete().eq("id", classId);
  if (error) throw new Error(error.message);
}

export async function createStream(input: {
  classId: string;
  name: string;
  createdBy: string;
}): Promise<Stream> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("streams")
    .insert({ class_id: input.classId, name: input.name.trim(), created_by: input.createdBy })
    .select("id, name")
    .single();

  if (error) throw new Error(error.message);
  return { id: data.id, name: data.name };
}

/** Blocked if any student is currently assigned to this stream. */
export async function deleteStream(streamId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("stream_id", streamId);

  if (count && count > 0) {
    throw new UserFacingError(`Cannot delete — ${count} student(s) are assigned to this stream.`);
  }

  const { error } = await supabase.from("streams").delete().eq("id", streamId);
  if (error) throw new Error(error.message);
}
