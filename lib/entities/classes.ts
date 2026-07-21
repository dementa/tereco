import { getSupabaseAdmin } from "@/lib/supabase";
import { UserFacingError } from "@/lib/apiResponse";
import type { TablesUpdate } from "@/lib/database.types";

export interface Stream {
  id: string;
  name: string;
}

export interface SchoolClass {
  id: string;
  /** Canonical ladder position (1-7), or null for off-ladder classes like ELITE. */
  level: number | null;
  /** The school's own label for this class, if it uses one. */
  alias: string | null;
  /** What to show the user: the alias if set, else the canonical P.n code. */
  displayName: string;
  hasStreams: boolean;
  isActive: boolean;
  streams: Stream[];
}

export interface SchoolDirectoryEntry {
  id: string;
  name: string;
  classes: SchoolClass[];
}

interface ClassRow {
  id: string;
  level: number | null;
  alias: string | null;
  has_streams: boolean;
  is_active: boolean;
  grade_level: { code: string } | null;
  streams: { id: string; name: string; is_active: boolean }[] | null;
}

// Single string literal, not a concatenation — the Supabase client infers the
// result shape from this select's literal type, and `+` widens it to `string`,
// which silently drops all column checking.
const CLASS_COLUMNS =
  "id, level, alias, has_streams, is_active, grade_level:grade_levels(code), streams(id, name, is_active)";

/**
 * Display rule from the schema: `coalesce(alias, grade_levels.code)`. A school
 * that calls P.1 "J1" gets "J1"; one that doesn't gets "P.1". Kept in one place
 * so every surface labels a class the same way.
 */
function classDisplayName(row: ClassRow): string {
  return row.alias ?? row.grade_level?.code ?? "";
}

function rowToClass(row: ClassRow): SchoolClass {
  return {
    id: row.id,
    level: row.level,
    alias: row.alias,
    displayName: classDisplayName(row),
    hasStreams: row.has_streams,
    isActive: row.is_active,
    streams: (row.streams ?? [])
      .filter((s) => s.is_active)
      .map((s) => ({ id: s.id, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Ladder classes first in P.1-P.7 order, then off-ladder ones alphabetically. */
function compareClasses(a: SchoolClass, b: SchoolClass): number {
  if (a.level !== null && b.level !== null) return a.level - b.level;
  if (a.level !== null) return -1;
  if (b.level !== null) return 1;
  return a.displayName.localeCompare(b.displayName);
}

/** Nested schools -> classes -> streams, for the lesson wizard and any other read-only directory consumer. */
export async function listSchoolsDirectory(): Promise<SchoolDirectoryEntry[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("schools")
    .select(`id, name, classes(${CLASS_COLUMNS})`)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((school) => ({
    id: school.id,
    name: school.name,
    classes: (school.classes as unknown as ClassRow[]).map(rowToClass).sort(compareClasses),
  }));
}

export async function listClassesForSchool(schoolId: string): Promise<SchoolClass[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("school_id", schoolId);

  if (error) throw new Error(error.message);

  return (data as unknown as ClassRow[]).map(rowToClass).sort(compareClasses);
}

export async function createClass(input: {
  schoolId: string;
  /** Ladder position, for a normal P.n class. */
  level?: number | null;
  /** The school's own label. Required when there is no level. */
  alias?: string | null;
  hasStreams: boolean;
  createdBy: string;
}): Promise<SchoolClass> {
  const level = input.level ?? null;
  const alias = input.alias?.trim() || null;

  // Mirrors the table's check constraint, so the user gets a sentence instead
  // of a constraint-violation string.
  if (level === null && alias === null) {
    throw new UserFacingError("A class needs either a grade level or a name.");
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("classes")
    .insert({
      school_id: input.schoolId,
      level,
      alias,
      has_streams: input.hasStreams,
      created_by: input.createdBy,
    })
    .select(CLASS_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new UserFacingError("This school already has that class.");
    }
    throw new Error(error.message);
  }
  return rowToClass(data as unknown as ClassRow);
}

export async function updateClass(
  classId: string,
  updates: { level?: number | null; alias?: string | null; hasStreams?: boolean; isActive?: boolean }
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const patch: TablesUpdate<"classes"> = {};
  if (updates.level !== undefined) patch.level = updates.level;
  if (updates.alias !== undefined) patch.alias = updates.alias?.trim() || null;
  if (updates.hasStreams !== undefined) patch.has_streams = updates.hasStreams;
  if (updates.isActive !== undefined) patch.is_active = updates.isActive;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("classes").update(patch).eq("id", classId);
  if (error) throw new Error(error.message);
}

/**
 * Blocked if any student is currently enrolled in this class.
 *
 * The count comes from open enrollment spans, not from a column on profiles —
 * placement lives in `enrollments` and nowhere else.
 */
export async function deleteClass(classId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { count, error: countError } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId)
    .is("exited_on", null);
  if (countError) throw new Error(countError.message);

  if (count && count > 0) {
    throw new UserFacingError(`Cannot delete — ${count} student(s) are enrolled in this class.`);
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

  if (error) {
    if (error.code === "23505") {
      throw new UserFacingError("This class already has a stream with that name.");
    }
    throw new Error(error.message);
  }
  return { id: data.id, name: data.name };
}

/**
 * Streams are soft-deleted. Enrollments reference them historically, so a
 * school tidying up its stream list must not cascade away years of records —
 * deactivating hides the stream from pickers while the history survives.
 */
export async function deleteStream(streamId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { count, error: countError } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("stream_id", streamId)
    .is("exited_on", null);
  if (countError) throw new Error(countError.message);

  if (count && count > 0) {
    throw new UserFacingError(`Cannot remove — ${count} student(s) are enrolled in this stream.`);
  }

  const { error } = await supabase.from("streams").update({ is_active: false }).eq("id", streamId);
  if (error) throw new Error(error.message);
}
