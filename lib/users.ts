import { getSupabaseAdmin } from "./supabase";
import { hashPasscode } from "./hash";

export interface AppUser {
  passcode: string;
  name: string;
  role: string;
  school: string;
}

export interface StaffUser {
  staffId: string;
  name: string;
  role: string;
  school: string;
}

export interface CreateUserInput {
  staffId: string;
  passcode: string;
  name: string;
  role: string;
  school: string;
}

interface StaffRow {
  staff_id: string | null;
  name: string | null;
  role: string | null;
  school: string | null;
}

/**
 * List all users without exposing passcode hashes.
 */
export async function listUsers(): Promise<StaffUser[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("staff_id, name, role, school")
    .order("staff_id", { ascending: true });

  if (error) {
    console.error("Error listing users:", error);
    return [];
  }
  return (data ?? [])
    .filter((row: StaffRow) => Boolean(row.staff_id))
    .map((row: StaffRow) => ({
      staffId: row.staff_id as string,
      name: row.name ?? "",
      role: row.role ?? "",
      school: row.school ?? "",
    }));
}

/**
 * Create a user, hashing the plaintext passcode before storage.
 */
export async function createUser(input: CreateUserInput): Promise<StaffUser> {
  const supabase = getSupabaseAdmin();
  const passcode_hash = await hashPasscode(input.passcode);
  const { data, error } = await supabase
    .from("users")
    .insert({
      staff_id: input.staffId,
      passcode_hash,
      name: input.name,
      role: input.role,
      school: input.school,
    })
    .select("staff_id, name, role, school")
    .single();

  if (error) throw new Error(error.message);
  return {
    staffId: data.staff_id as string,
    name: data.name ?? "",
    role: data.role ?? "",
    school: data.school ?? "",
  };
}

export async function deleteUser(staffId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("users").delete().eq("staff_id", staffId);
  if (error) throw new Error(error.message);
}

/**
 * Fetch all users keyed by staff ID.
 */
export async function getUsers(): Promise<Record<string, AppUser>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("staff_id, passcode_hash, name, role, school");

  if (error) {
    console.error("Error fetching users:", error);
    return {};
  }

  const users: Record<string, AppUser> = {};
  for (const row of data ?? []) {
    if (!row.staff_id || !row.passcode_hash) continue;
    users[row.staff_id] = {
      passcode: row.passcode_hash,
      name: row.name ?? "",
      role: row.role ?? "",
      school: row.school ?? "",
    };
  }
  return users;
}
