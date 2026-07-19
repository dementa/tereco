import { getSupabaseAdmin } from "@/lib/supabase";
import { generateSystemId } from "@/lib/idGenerator";

export interface School {
  id: string;
  systemId: string;
  name: string;
  location: string;
  contactEmail: string | null;
  contactPerson: string;
  contactNumber: string;
  /** @deprecated superseded by the classes/streams tables — kept for read-compat only */
  classes: string[];
}

interface SchoolRow {
  id: string;
  system_id: string;
  name: string;
  location: string | null;
  contact_email: string | null;
  contact_person: string | null;
  contact_number: string | null;
  classes: string[] | null;
}

function rowToSchool(row: SchoolRow): School {
  return {
    id: row.id,
    systemId: row.system_id,
    name: row.name,
    location: row.location ?? "",
    contactEmail: row.contact_email,
    contactPerson: row.contact_person ?? "",
    contactNumber: row.contact_number ?? "",
    classes: row.classes ?? [],
  };
}

const SCHOOL_COLUMNS = "id, system_id, name, location, contact_email, contact_person, contact_number, classes";

export async function listSchools(): Promise<School[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOL_COLUMNS)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToSchool);
}

export async function createSchool(input: {
  name: string;
  location?: string;
  contactEmail?: string;
  contactPerson?: string;
  contactNumber?: string;
  createdBy: string;
}): Promise<School> {
  const supabase = getSupabaseAdmin();
  const systemId = await generateSystemId("school");
  const { data, error } = await supabase
    .from("schools")
    .insert({
      system_id: systemId,
      name: input.name,
      location: input.location ?? "",
      contact_email: input.contactEmail || null,
      contact_person: input.contactPerson ?? "",
      contact_number: input.contactNumber ?? "",
      classes: [],
      created_by: input.createdBy,
    })
    .select(SCHOOL_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return rowToSchool(data);
}
