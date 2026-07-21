import { getSupabaseAdmin } from "@/lib/supabase";
import { UserFacingError } from "@/lib/apiResponse";
import type { TablesUpdate } from "@/lib/database.types";

export interface AcademicYear {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  /** How many terms this year has defined, across all schools. */
  termCount: number;
}

interface YearRow {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
  terms: { count: number }[];
}

const YEAR_COLUMNS = "id, label, starts_on, ends_on, is_current, terms(count)";

function rowToYear(row: YearRow): AcademicYear {
  return {
    id: row.id,
    label: row.label,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    isCurrent: row.is_current,
    termCount: row.terms?.[0]?.count ?? 0,
  };
}

export async function listAcademicYears(): Promise<AcademicYear[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("academic_years")
    .select(YEAR_COLUMNS)
    .order("starts_on", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as YearRow[]).map(rowToYear);
}

export async function getCurrentAcademicYear(): Promise<AcademicYear | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("academic_years")
    .select(YEAR_COLUMNS)
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToYear(data as unknown as YearRow) : null;
}

/**
 * Translates the database's structural guarantees into sentences a person can
 * act on. These are constraint violations, not validation we could skip — the
 * database refuses them regardless of what the UI allows.
 */
function describeYearError(error: { code?: string; message: string }): never {
  if (error.code === "23P01") {
    throw new UserFacingError(
      "That date range overlaps an existing academic year. Years cannot overlap, because a lesson's date has to resolve to exactly one year."
    );
  }
  if (error.code === "23505") {
    throw new UserFacingError("An academic year with that name already exists.");
  }
  if (error.code === "23514") {
    throw new UserFacingError("The end date must be after the start date.");
  }
  throw new Error(error.message);
}

export async function createAcademicYear(input: {
  label: string;
  startsOn: string;
  endsOn: string;
  makeCurrent?: boolean;
}): Promise<AcademicYear> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("academic_years")
    .insert({
      label: input.label.trim(),
      starts_on: input.startsOn,
      ends_on: input.endsOn,
    })
    .select("id")
    .single();

  if (error) describeYearError(error);

  // Done through the function rather than as part of the insert: it clears the
  // previous current year in the same statement, which a plain insert cannot.
  if (input.makeCurrent) await setCurrentAcademicYear(data.id);

  const created = await listAcademicYears();
  const year = created.find((y) => y.id === data.id);
  if (!year) throw new Error("Academic year was created but could not be read back");
  return year;
}

export async function updateAcademicYear(
  yearId: string,
  updates: { label?: string; startsOn?: string; endsOn?: string }
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const patch: TablesUpdate<"academic_years"> = {};
  if (updates.label !== undefined) patch.label = updates.label.trim();
  if (updates.startsOn !== undefined) patch.starts_on = updates.startsOn;
  if (updates.endsOn !== undefined) patch.ends_on = updates.endsOn;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("academic_years").update(patch).eq("id", yearId);
  if (error) describeYearError(error);
}

/** Atomic: clears the previous current year and sets this one in one statement. */
export async function setCurrentAcademicYear(yearId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc("set_current_academic_year", { p_year_id: yearId });
  if (error) throw new Error(error.message);
}

/**
 * Blocked once anything references the year. Enrollments and lesson reports
 * resolve their year here; removing it would orphan them.
 */
export async function deleteAcademicYear(yearId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const [enrollments, lessons, terms] = await Promise.all([
    supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("academic_year_id", yearId),
    supabase.from("lesson_reports").select("id", { count: "exact", head: true }).eq("academic_year_id", yearId),
    supabase.from("terms").select("id", { count: "exact", head: true }).eq("academic_year_id", yearId),
  ]);

  const blockers: string[] = [];
  if (enrollments.count) blockers.push(`${enrollments.count} enrolment(s)`);
  if (lessons.count) blockers.push(`${lessons.count} lesson report(s)`);
  if (terms.count) blockers.push(`${terms.count} term(s)`);

  if (blockers.length) {
    throw new UserFacingError(`Cannot delete — this year still has ${blockers.join(", ")}.`);
  }

  const { error } = await supabase.from("academic_years").delete().eq("id", yearId);
  if (error) throw new Error(error.message);
}
