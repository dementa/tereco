import { getSupabaseAdmin } from "@/lib/supabase";
import { UserFacingError } from "@/lib/apiResponse";
import type { TablesUpdate } from "@/lib/database.types";

export interface Term {
  id: string;
  schoolId: string;
  academicYearId: string;
  number: number;
  name: string;
  startsOn: string;
  endsOn: string;
}

interface TermRow {
  id: string;
  school_id: string;
  academic_year_id: string;
  number: number;
  name: string;
  starts_on: string;
  ends_on: string;
}

const TERM_COLUMNS = "id, school_id, academic_year_id, number, name, starts_on, ends_on";

function rowToTerm(row: TermRow): Term {
  return {
    id: row.id,
    schoolId: row.school_id,
    academicYearId: row.academic_year_id,
    number: row.number,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  };
}

export async function listTermsForSchool(schoolId: string, academicYearId?: string): Promise<Term[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase.from("terms").select(TERM_COLUMNS).eq("school_id", schoolId).order("number", { ascending: true });
  if (academicYearId) query = query.eq("academic_year_id", academicYearId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as unknown as TermRow[]).map(rowToTerm);
}

export async function getTerm(termId: string): Promise<Term | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("terms").select(TERM_COLUMNS).eq("id", termId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToTerm(data as unknown as TermRow) : null;
}

export interface DistinctTerm {
  /** One representative term id for this (year, number) pair — schools don't share exact dates, but getSchoolBenchmark resolves peers by number, so any one id is enough. */
  termId: string;
  academicYearId: string;
  academicYearLabel: string;
  number: number;
}

/**
 * Every (academic year, term number) combination that exists for ANY school,
 * newest first — the option list for the super-admin cross-school benchmark's
 * term picker. Deliberately not scoped to one school: "Term II" there means
 * every school's own Term II (see getSchoolBenchmark), so the picker offers
 * the (year, number) pair, not a specific school's term.
 */
export async function listDistinctTerms(): Promise<DistinctTerm[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("terms")
    .select("id, academic_year_id, number, starts_on, academic_year:academic_years(label)")
    .order("starts_on", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = data as unknown as {
    id: string;
    academic_year_id: string;
    number: number;
    academic_year: { label: string } | null;
  }[];

  const seen = new Map<string, DistinctTerm>();
  for (const row of rows) {
    const key = `${row.academic_year_id}:${row.number}`;
    if (!seen.has(key)) {
      seen.set(key, {
        termId: row.id,
        academicYearId: row.academic_year_id,
        academicYearLabel: row.academic_year?.label ?? "",
        number: row.number,
      });
    }
  }
  return Array.from(seen.values());
}

/**
 * Translates the database's structural guarantees into sentences a person can
 * act on — same approach as describeYearError in lib/entities/academic-years.ts.
 * These are constraint violations, not validation the UI could skip instead.
 */
function describeTermError(error: { code?: string; message: string }): never {
  if (error.code === "23P01") {
    throw new UserFacingError(
      "Those dates overlap an existing term for this school and year. Terms cannot overlap, because a lesson's date has to resolve to exactly one term."
    );
  }
  if (error.code === "23505") {
    throw new UserFacingError("This school already has a term with that number for this academic year.");
  }
  if (error.code === "23514") {
    throw new UserFacingError("Check the term number (1-3) and that the end date is after the start date.");
  }
  throw new Error(error.message);
}

export async function createTerm(input: {
  schoolId: string;
  academicYearId: string;
  number: number;
  name: string;
  startsOn: string;
  endsOn: string;
}): Promise<Term> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("terms")
    .insert({
      school_id: input.schoolId,
      academic_year_id: input.academicYearId,
      number: input.number,
      name: input.name.trim(),
      starts_on: input.startsOn,
      ends_on: input.endsOn,
    })
    .select(TERM_COLUMNS)
    .single();

  if (error) describeTermError(error);
  return rowToTerm(data as unknown as TermRow);
}

/**
 * Number is not editable — a school correcting a term's number is rare enough
 * that delete-and-recreate is simpler than re-deriving the overlap/uniqueness
 * checks for a changed number against the same row.
 */
export async function updateTerm(
  termId: string,
  updates: { name?: string; startsOn?: string; endsOn?: string }
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const patch: TablesUpdate<"terms"> = {};
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.startsOn !== undefined) patch.starts_on = updates.startsOn;
  if (updates.endsOn !== undefined) patch.ends_on = updates.endsOn;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("terms").update(patch).eq("id", termId);
  if (error) describeTermError(error);
}

/**
 * No blocker check the way deleteAcademicYear has one: lesson_reports.term_id
 * is set by a trigger (term_for_date), not a user choice, so removing a term
 * just changes what a future lesson date resolves to — it doesn't orphan a
 * user-made reference.
 */
export async function deleteTerm(termId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("terms").delete().eq("id", termId);
  if (error) throw new Error(error.message);
}
