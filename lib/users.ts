import { getSupabaseAdmin } from "./supabase";

export interface AppUser {
  passcode: string;
  name: string;
  role: string;
  school: string;
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
