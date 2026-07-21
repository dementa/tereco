import { getSupabaseAdmin } from "@/lib/supabase";
import { generateSystemId, SystemIdEntity } from "@/lib/idGenerator";
import { generateTemporaryPassword } from "@/lib/auth/password";
import { sendCredentialsEmail } from "@/lib/email";
import { UserFacingError } from "@/lib/apiResponse";
import type { TablesUpdate } from "@/lib/database.types";

export type AccountRole = "admin" | "staff" | "student" | "parent";

/** Matches the profiles.gender check constraint. */
export type Gender = "male" | "female";

const STUDENT_PLACEHOLDER_DOMAIN = "students.tereco.internal";

/**
 * `profiles` stores names split, never as one display string. Callers that only
 * have a single typed-in name get it split here: first token is the first name,
 * the remainder is the last name (middle names are only captured when the
 * caller supplies the fields separately).
 */
function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function resolveNameParts(input: CreateAccountInput): {
  firstName: string;
  middleName: string | null;
  lastName: string;
} {
  if (input.firstName || input.lastName) {
    return {
      firstName: (input.firstName ?? "").trim(),
      middleName: input.middleName?.trim() || null,
      lastName: (input.lastName ?? "").trim(),
    };
  }
  const split = splitName(input.name ?? "");
  return { ...split, middleName: null };
}

export function fullName(parts: {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
}): string {
  return [parts.first_name, parts.middle_name, parts.last_name].filter(Boolean).join(" ").trim();
}

export interface CreateAccountInput {
  role: AccountRole;
  name?: string; // admin/staff/parent — a single display name, split on save
  firstName?: string; // preferred: supply the parts directly
  middleName?: string;
  lastName?: string;
  email?: string | null; // optional for students — a placeholder auth identifier is used when absent
  schoolId?: string | null; // staff/parent only; must be null for admin and student
  classId?: string | null; // student — opens an enrollment
  streamId?: string | null; // student — only when the class has streams
  dateOfBirth?: string | null; // ISO date, student
  gender?: Gender | null;
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
  gender: Gender | null;
  className: string | null;
  streamName: string | null;
  photoUrl: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
}

/** The academic year an enrollment opened today belongs to. */
async function currentAcademicYearId(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("academic_years")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new UserFacingError(
      "No academic year is marked as current — set one before enrolling students."
    );
  }
  return data.id;
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
 *
 * A student's class is NOT written onto the profile — it opens a row in
 * `enrollments`. Placement is a dated span, so that promoting or transferring
 * a student later cannot rewrite which class their past records belong to.
 */
export async function createAccount(input: CreateAccountInput): Promise<CreatedAccount> {
  const supabase = getSupabaseAdmin();

  // Enforced by profiles_school_scope_ck; checked here so the caller gets a
  // sentence rather than a constraint violation.
  const schoolId =
    input.role === "admin" || input.role === "student" ? null : input.schoolId ?? null;

  if (input.role === "student" && input.classId && !input.schoolId) {
    throw new UserFacingError("A student's enrollment needs a school.");
  }

  // Resolve this before creating anything, so a missing academic year fails
  // before we have an auth user to roll back.
  const academicYearId =
    input.role === "student" && input.classId ? await currentAcademicYearId() : null;

  const systemId = await generateSystemId(input.role as SystemIdEntity);
  const temporaryPassword = generateTemporaryPassword();
  const realEmail = input.email?.trim() || null;
  const authEmail = realEmail || `${systemId.toLowerCase()}@${STUDENT_PLACEHOLDER_DOMAIN}`;
  const { firstName, middleName, lastName } = resolveNameParts(input);

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

  const { error: profileError } = await supabase.from("profiles").insert({
    id: authUser.user.id,
    system_id: systemId,
    role: input.role,
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    email: authEmail,
    contact_email: realEmail,
    date_of_birth: input.dateOfBirth ?? null,
    gender: input.gender ?? null,
    school_id: schoolId,
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
      throw new UserFacingError("The selected school no longer exists — refresh and try again.");
    }
    throw new Error(profileError.message);
  }

  if (input.classId && input.schoolId && academicYearId) {
    const { error: enrollError } = await supabase.from("enrollments").insert({
      student_id: authUser.user.id,
      school_id: input.schoolId,
      class_id: input.classId,
      stream_id: input.streamId ?? null,
      academic_year_id: academicYearId,
      enrolled_on: new Date().toISOString().slice(0, 10),
      created_by: input.createdBy,
    });

    // Roll the whole thing back: an account created without the placement the
    // caller asked for is worse than no account, because nothing surfaces it
    // as incomplete. Deleting the auth user cascades the profile away.
    if (enrollError) {
      await supabase.auth.admin.deleteUser(authUser.user.id);
      if (enrollError.code === "23503") {
        throw new UserFacingError(
          "The selected class or stream no longer exists — refresh and try again."
        );
      }
      throw new Error(enrollError.message);
    }
  }

  const displayName = fullName({
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
  });
  const emailResult = realEmail
    ? await sendCredentialsEmail({
        to: realEmail,
        name: displayName,
        systemId,
        temporaryPassword,
        role: input.role,
      })
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

export async function setAccountActive(profileId: string, isActive: boolean): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) throw new Error(error.message);
}

export async function deactivateAccount(profileId: string): Promise<void> {
  await setAccountActive(profileId, false);
}

export interface UpdateAccountInput {
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  contactEmail?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  phonePrimary?: string | null;
  schoolId?: string | null;
  isActive?: boolean;
}

/**
 * Edits a person's details.
 *
 * Deliberately cannot change `role` or `system_id`: the id encodes the role
 * (TSF/TST/TPR) and is referenced by enrolments, submissions and audit rows, so
 * a role change would leave someone holding an id that contradicts what they
 * are. Deactivate and create the correct account instead.
 */
export async function updateAccount(
  profileId: string,
  updates: UpdateAccountInput
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .single();
  if (readError) throw new Error(readError.message);

  const patch: TablesUpdate<"profiles"> = { updated_at: new Date().toISOString() };
  if (updates.firstName !== undefined) patch.first_name = updates.firstName.trim();
  if (updates.middleName !== undefined) patch.middle_name = updates.middleName?.trim() || null;
  if (updates.lastName !== undefined) patch.last_name = updates.lastName.trim();
  if (updates.contactEmail !== undefined) patch.contact_email = updates.contactEmail || null;
  if (updates.gender !== undefined) patch.gender = updates.gender;
  if (updates.dateOfBirth !== undefined) patch.date_of_birth = updates.dateOfBirth || null;
  if (updates.phonePrimary !== undefined) patch.phone_primary = updates.phonePrimary || null;
  if (updates.isActive !== undefined) patch.is_active = updates.isActive;

  // profiles_school_scope_ck forbids a school on admins and students; a student's
  // school comes from their enrolment. Silently ignoring it here beats a
  // constraint violation the caller cannot interpret.
  if (updates.schoolId !== undefined && existing.role !== "admin" && existing.role !== "student") {
    patch.school_id = updates.schoolId;
  }

  const { error } = await supabase.from("profiles").update(patch).eq("id", profileId);
  if (error) throw new Error(error.message);
}

/**
 * Removes an account outright, but only while it holds no history.
 *
 * Deactivation is the right move for anyone who has actually done anything —
 * deleting a student who has sat papers would take those results with them, and
 * a teacher's lesson reports are the programme's record. This reports what is in
 * the way rather than failing with a foreign-key error.
 */
export async function deleteAccount(profileId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const [submissions, lessons, enrollments, children] = await Promise.all([
    supabase.from("assessment_submissions").select("id", { count: "exact", head: true }).eq("student_id", profileId),
    supabase.from("lesson_reports").select("id", { count: "exact", head: true }).eq("staff_id", profileId),
    supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("student_id", profileId),
    supabase.from("parent_students").select("parent_id", { count: "exact", head: true }).eq("parent_id", profileId),
  ]);

  const blockers = [
    submissions.count && `${submissions.count} assessment submission(s)`,
    lessons.count && `${lessons.count} lesson report(s)`,
    enrollments.count && `${enrollments.count} enrolment(s)`,
    children.count && `${children.count} linked child(ren)`,
  ].filter(Boolean);

  if (blockers.length) {
    throw new UserFacingError(
      `Cannot delete — this account has ${blockers.join(", ")}. Deactivate it instead to keep those records.`
    );
  }

  // Deleting the auth user cascades the profile; doing it the other way round
  // would leave a sign-in that resolves to nobody.
  const { error } = await supabase.auth.admin.deleteUser(profileId);
  if (error) throw new Error(error.message);
}

export async function listAccounts(role: AccountRole | AccountRole[]): Promise<AccountRow[]> {
  const supabase = getSupabaseAdmin();
  const roles = Array.isArray(role) ? role : [role];
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, system_id, role, first_name, middle_name, last_name, contact_email, school_id, gender, photo_url, must_change_password, is_active, created_at, school:schools!profiles_school_id_fkey(name)"
    )
    .in("role", roles)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data ?? [];

  // Placement is not on the profile — it is the student's open enrollment. One
  // batched lookup keyed by student id, rather than a join per row.
  //
  // The SCHOOL comes from here too. profiles_school_scope_ck forces
  // profiles.school_id to be null for students, so reading their school from
  // the profile returns blank every time — it lives on the enrolment, exactly
  // like the class does.
  const studentIds = rows.filter((r) => r.role === "student").map((r) => r.id);
  const placements = new Map<
    string,
    { schoolId: string | null; schoolName: string | null; className: string | null; streamName: string | null }
  >();

  if (studentIds.length > 0) {
    const { data: enrollments, error: enrollError } = await supabase
      .from("current_enrollments")
      .select("student_id, school_id, class_display_name, stream_name, school:schools(name)")
      .in("student_id", studentIds);
    if (enrollError) throw new Error(enrollError.message);

    for (const e of enrollments ?? []) {
      if (e.student_id === null) continue;
      placements.set(e.student_id, {
        schoolId: e.school_id,
        schoolName: e.school?.name ?? null,
        className: e.class_display_name,
        streamName: e.stream_name,
      });
    }
  }

  return rows.map((row) => {
    const placement = placements.get(row.id);
    return {
      id: row.id,
      systemId: row.system_id,
      role: row.role,
      name: fullName(row),
      contactEmail: row.contact_email,
      gender: (row.gender as Gender | null) ?? null,
      // Students get both from their enrolment; everyone else from the profile.
      schoolId: placement?.schoolId ?? row.school_id,
      schoolName: placement?.schoolName ?? row.school?.name ?? null,
      className: placement?.className ?? null,
      streamName: placement?.streamName ?? null,
      photoUrl: row.photo_url,
      mustChangePassword: row.must_change_password,
      isActive: row.is_active,
      createdAt: row.created_at,
    };
  });
}
