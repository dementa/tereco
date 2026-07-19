import { getSupabaseAdmin } from "@/lib/supabase";
import { generateSystemId, SystemIdEntity } from "@/lib/idGenerator";
import { generateTemporaryPassword } from "@/lib/auth/password";
import { sendCredentialsEmail } from "@/lib/email";
import { UserFacingError } from "@/lib/apiResponse";

export type AccountRole = "admin" | "staff" | "student" | "parent";

const STUDENT_PLACEHOLDER_DOMAIN = "students.tereco.internal";

function composeName(input: {
  name?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
}): string {
  if (input.firstName || input.lastName) {
    return [input.firstName, input.middleName, input.lastName].filter(Boolean).join(" ").trim();
  }
  return (input.name ?? "").trim();
}

export interface CreateAccountInput {
  role: AccountRole;
  name?: string; // admin/staff/parent — a single display name
  firstName?: string; // student — split name
  middleName?: string;
  lastName?: string;
  email?: string | null; // optional for students — a placeholder auth identifier is used when absent
  schoolId?: string | null;
  classId?: string | null; // student
  streamId?: string | null; // student — only when the class has streams
  dateOfBirth?: string | null; // ISO date, student
  createdBy: string; // profiles.id of the super admin creating this account
}

export interface CreatedAccount {
  profileId: string;
  systemId: string;
  temporaryPassword: string;
  emailSent: boolean;
  emailError?: string;
  hasEmail: boolean; // false ⇒ a placeholder was used; Resend was never attempted
}

export interface AccountRow {
  id: string;
  systemId: string | null;
  role: string;
  name: string;
  contactEmail: string | null;
  schoolId: string | null;
  schoolName: string | null;
  className: string | null;
  streamName: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
}

/**
 * Provisions a login-capable account: auth.users row + profiles row, with a
 * system-generated ID and a system-generated temporary password. Best-effort
 * emails the credentials via Resend when a real email is given, and rolls
 * back the auth user if the profile insert fails, so a failure never leaves
 * an orphaned unusable account with no matching profile.
 *
 * Email is optional (students may not have one yet): when absent, a
 * placeholder address is used purely as the Supabase Auth identifier —
 * invisible everywhere else. Login is by System ID regardless, so this
 * changes nothing about how the account actually signs in.
 */
export async function createAccount(input: CreateAccountInput): Promise<CreatedAccount> {
  const supabase = getSupabaseAdmin();

  const systemId = await generateSystemId(input.role as SystemIdEntity);
  const temporaryPassword = generateTemporaryPassword();
  const realEmail = input.email?.trim() || null;
  const authEmail = realEmail || `${systemId.toLowerCase()}@${STUDENT_PLACEHOLDER_DOMAIN}`;
  const name = composeName(input);

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: authEmail,
    password: temporaryPassword,
    email_confirm: true,
  });
  if (authError || !authUser.user) {
    if (authError?.code === "email_exists") {
      throw new UserFacingError(`An account with the email "${authEmail}" already exists.`);
    }
    if (authError?.code === "email_address_invalid") {
      throw new UserFacingError(`"${authEmail}" isn't a valid email address.`);
    }
    throw new Error(authError?.message ?? "Failed to create auth user");
  }

  // Mirror a display-friendly class_name so anything still reading that
  // legacy text column (e.g. today's flat-string assessment targeting)
  // keeps working for display purposes until that's migrated. Best-effort —
  // never blocks account creation.
  let classNameDisplay: string | null = null;
  if (input.classId) {
    const { data: classRow } = await supabase.from("classes").select("name").eq("id", input.classId).maybeSingle();
    let streamNameDisplay: string | null = null;
    if (input.streamId) {
      const { data: streamRow } = await supabase.from("streams").select("name").eq("id", input.streamId).maybeSingle();
      streamNameDisplay = streamRow?.name ?? null;
    }
    if (classRow?.name) {
      classNameDisplay = streamNameDisplay ? `${classRow.name} ${streamNameDisplay}` : classRow.name;
    }
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: authUser.user.id,
    system_id: systemId,
    role: input.role,
    name,
    email: authEmail,
    contact_email: realEmail,
    first_name: input.firstName ?? null,
    middle_name: input.middleName ?? null,
    last_name: input.lastName ?? null,
    date_of_birth: input.dateOfBirth ?? null,
    school_id: input.schoolId ?? null,
    class_id: input.classId ?? null,
    stream_id: input.streamId ?? null,
    class_name: classNameDisplay,
    // Students use the provided password as-is — no forced first-login
    // change screen. The only way a student's password changes is a super
    // admin issuing a reset (which does force a change at that point — see
    // resetAccountPassword). Other roles keep the forced first-login change.
    must_change_password: input.role !== "student",
    created_by: input.createdBy,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    if (profileError.code === "23503") {
      throw new UserFacingError("The selected school, class, or stream no longer exists — refresh and try again.");
    }
    throw new Error(profileError.message);
  }

  const emailResult = realEmail
    ? await sendCredentialsEmail({ to: realEmail, name, systemId, temporaryPassword, role: input.role })
    : { sent: false, error: undefined as string | undefined };

  return {
    profileId: authUser.user.id,
    systemId,
    temporaryPassword,
    emailSent: emailResult.sent,
    emailError: emailResult.error,
    hasEmail: !!realEmail,
  };
}

/** Super admin resets someone's password — new temp password, forces a change on next login. */
export async function resetAccountPassword(profileId: string): Promise<{ temporaryPassword: string }> {
  const supabase = getSupabaseAdmin();
  const temporaryPassword = generateTemporaryPassword();

  const { error } = await supabase.auth.admin.updateUserById(profileId, {
    password: temporaryPassword,
  });
  if (error) throw new Error(error.message);

  await supabase
    .from("profiles")
    .update({ must_change_password: true, updated_at: new Date().toISOString() })
    .eq("id", profileId);

  return { temporaryPassword };
}

export async function deactivateAccount(profileId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) throw new Error(error.message);
}

export async function listAccounts(role: AccountRole | AccountRole[]): Promise<AccountRow[]> {
  const supabase = getSupabaseAdmin();
  const roles = Array.isArray(role) ? role : [role];
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, system_id, role, name, contact_email, school_id, must_change_password, is_active, created_at, " +
        "schools!profiles_school_id_fkey(name), classes!profiles_class_id_fkey(name), streams!profiles_stream_id_fkey(name)"
    )
    .in("role", roles)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  interface Row {
    id: string;
    system_id: string | null;
    role: string;
    name: string | null;
    contact_email: string | null;
    school_id: string | null;
    must_change_password: boolean;
    is_active: boolean;
    created_at: string;
    schools: { name: string } | null;
    classes: { name: string } | null;
    streams: { name: string } | null;
  }

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    systemId: row.system_id,
    role: row.role,
    name: row.name ?? "",
    contactEmail: row.contact_email,
    schoolId: row.school_id,
    schoolName: row.schools?.name ?? null,
    className: row.classes?.name ?? null,
    streamName: row.streams?.name ?? null,
    mustChangePassword: row.must_change_password,
    isActive: row.is_active,
    createdAt: row.created_at,
  }));
}
