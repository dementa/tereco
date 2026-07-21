import { getSupabaseAdmin } from "@/lib/supabase";
import { generateSystemId } from "@/lib/idGenerator";
import { UserFacingError } from "@/lib/apiResponse";
import type { TablesUpdate } from "@/lib/database.types";

export interface School {
  id: string;
  systemId: string;
  name: string;
  location: string;
  phone: string;
  email: string | null;
  logoUrl: string | null;
  /** When this school came onto the programme; reports before it are legitimately empty. */
  joinedOn: string | null;
  isActive: boolean;
  /**
   * The school's contact person, modelled as a normal staff profile rather than
   * loose name/number columns — so activating their login later needs no schema
   * change. Null until someone is nominated.
   */
  contactProfileId: string | null;
  contactName: string | null;
}

interface SchoolRow {
  id: string;
  system_id: string;
  name: string;
  location: string;
  phone: string;
  email: string | null;
  logo_url: string | null;
  joined_on: string | null;
  is_active: boolean;
  contact_profile_id: string | null;
  contact: { first_name: string; last_name: string } | null;
}

function rowToSchool(row: SchoolRow): School {
  const contact = row.contact;
  return {
    id: row.id,
    systemId: row.system_id,
    name: row.name,
    location: row.location,
    phone: row.phone,
    email: row.email,
    logoUrl: row.logo_url,
    joinedOn: row.joined_on,
    isActive: row.is_active,
    contactProfileId: row.contact_profile_id,
    contactName: contact ? `${contact.first_name} ${contact.last_name}`.trim() : null,
  };
}

// Must stay a single string literal, not a concatenation — the Supabase client
// infers the result shape from the literal type of this select, and `+` widens
// it to `string`, which silently drops all column checking.
const SCHOOL_COLUMNS =
  "id, system_id, name, location, phone, email, logo_url, joined_on, is_active, contact_profile_id, contact:profiles!schools_contact_profile_id_fkey(first_name, last_name)";

export async function listSchools(): Promise<School[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOL_COLUMNS)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToSchool);
}

export async function getSchool(schoolId: string): Promise<School | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOL_COLUMNS)
    .eq("id", schoolId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToSchool(data) : null;
}

export async function createSchool(input: {
  name: string;
  location?: string;
  phone?: string;
  email?: string;
  joinedOn?: string;
  createdBy: string;
}): Promise<School> {
  const supabase = getSupabaseAdmin();
  const systemId = await generateSystemId("school");
  const { data, error } = await supabase
    .from("schools")
    .insert({
      system_id: systemId,
      name: input.name.trim(),
      location: input.location ?? "",
      phone: input.phone ?? "",
      email: input.email || null,
      joined_on: input.joinedOn || null,
      created_by: input.createdBy,
    })
    .select(SCHOOL_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return rowToSchool(data);
}

export async function updateSchool(
  schoolId: string,
  updates: {
    name?: string;
    location?: string;
    phone?: string;
    email?: string | null;
    logoUrl?: string | null;
    joinedOn?: string | null;
    isActive?: boolean;
    contactProfileId?: string | null;
  }
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const patch: TablesUpdate<"schools"> = {};
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.location !== undefined) patch.location = updates.location;
  if (updates.phone !== undefined) patch.phone = updates.phone;
  if (updates.email !== undefined) patch.email = updates.email || null;
  if (updates.logoUrl !== undefined) patch.logo_url = updates.logoUrl;
  if (updates.joinedOn !== undefined) patch.joined_on = updates.joinedOn || null;
  if (updates.isActive !== undefined) patch.is_active = updates.isActive;
  if (updates.contactProfileId !== undefined) patch.contact_profile_id = updates.contactProfileId;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("schools").update(patch).eq("id", schoolId);
  if (error) {
    if (error.code === "23505") {
      throw new UserFacingError("Another school already uses that name.");
    }
    throw new Error(error.message);
  }
}

/**
 * Removes a school outright, but only while nothing depends on it.
 *
 * Classes and streams cascade, which is safe — they are structure. Enrolments,
 * lesson reports and staff do NOT, and must not: deleting a school that has
 * recorded history would take that history with it. Once a school has been
 * used, deactivating it is the correct move, so this reports exactly what is
 * in the way rather than failing with a foreign-key error.
 */
export async function deleteSchool(schoolId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const [enrollments, lessons, staff, targets] = await Promise.all([
    supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("lesson_reports").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("assessment_targets").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
  ]);

  const blockers = [
    enrollments.count && `${enrollments.count} enrolment(s)`,
    lessons.count && `${lessons.count} lesson report(s)`,
    staff.count && `${staff.count} staff member(s)`,
    targets.count && `${targets.count} assessment target(s)`,
  ].filter(Boolean);

  if (blockers.length) {
    throw new UserFacingError(
      `Cannot delete — this school still has ${blockers.join(", ")}. Deactivate it instead to keep its records.`
    );
  }

  const { error } = await supabase.from("schools").delete().eq("id", schoolId);
  if (error) throw new Error(error.message);
}
