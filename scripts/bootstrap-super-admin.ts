import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

/**
 * Creates (or repairs) the one fixed super admin account.
 *
 * Idempotent: run it as many times as you like. If the auth user already
 * exists it resets the password and re-links the profile rather than failing,
 * which is what you want after dropping and rebuilding the public schema —
 * auth.users lives in the `auth` schema and survives that.
 *
 * Run: node scripts/bootstrap-super-admin.ts   (Node 24 strips TS natively)
 *
 * Set SUPER_ADMIN_PASSWORD to choose the password. If you don't, a strong one
 * is generated and printed once.
 *
 * There is deliberately no hardcoded default: this file is in version control,
 * and a literal here would be the real password of a real account, readable by
 * anyone with repository access — forever, since git history keeps it even
 * after the line is edited away.
 */

const EMAIL = "victordementa@gmail.com";

async function run() {
  const { createClient } = await import("@supabase/supabase-js");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { generateTemporaryPassword } = await import("../lib/auth/password");
  // Longer than the 6-character default used for student temporaries: this
  // account can read and change every record in the system.
  const password = process.env.SUPER_ADMIN_PASSWORD || generateTemporaryPassword(20);

  if (!url || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 1. Find or create the auth user ──────────────────────────────────────
  let userId: string | undefined;

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password,
    email_confirm: true,
  });

  if (created?.user) {
    userId = created.user.id;
    console.log("Created auth user.");
  } else {
    // Already exists — find them and reset the password to the known value.
    const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (listError) {
      console.error("Could not list auth users:", listError.message);
      process.exitCode = 1;
      return;
    }
    const existing = list.users.find((u) => u.email?.toLowerCase() === EMAIL);
    if (!existing) {
      console.error("Could not create or find the auth user:", createError?.message);
      process.exitCode = 1;
      return;
    }
    userId = existing.id;
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password });
    if (updateError) {
      console.error("Found the auth user but could not reset the password:", updateError.message);
      process.exitCode = 1;
      return;
    }
    console.log("Auth user already existed — password reset.");
  }

  // ── 2. Upsert the profile ────────────────────────────────────────────────
  // system_id stays null: the super admin is the one fixed account, not a
  // provisioned entity, so it has no TA-YYYY-#### identifier. school_id stays
  // null because the role is TERECO-wide (enforced by profiles_school_scope_ck).
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      system_id: null,
      role: "super_admin",
      first_name: "Victor",
      last_name: "Nuwarimpa",
      email: EMAIL,
      contact_email: EMAIL,
      school_id: null,
      // false, not true: you chose this password deliberately, so don't force a
      // change wall on first login. You can still change it from the console.
      must_change_password: false,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error("Failed to write the super admin profile:", profileError.message);
    process.exitCode = 1;
    return;
  }

  await supabase.from("audit_log").insert({
    actor_id: userId,
    actor_email: EMAIL,
    actor_name: "Victor Nuwarimpa",
    actor_role: "super_admin",
    action: "password_reset",
    entity_type: "profiles",
    entity_id: userId,
    entity_label: EMAIL,
    summary: "Super admin account bootstrapped via scripts/bootstrap-super-admin.ts",
  });

  console.log("\nSuper admin ready.");
  console.log(`  Email:    ${EMAIL}`);
  console.log(`  Password: ${password}`);
  console.log("\nChange this from the console once you're in.");
}

run();
