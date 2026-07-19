import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// One-off: creates the single fixed super admin account. Safe to re-run —
// if the account already exists, it reports that and exits without changes.
// Run: node scripts/seed-super-admin.ts

const SUPER_ADMIN_EMAIL = "victordementa@gmail.com";

async function run() {
  const { createClient } = await import("@supabase/supabase-js");
  const { generateTemporaryPassword } = await import("../lib/auth/password.ts");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error("Missing Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("role", "super_admin")
    .maybeSingle();

  if (existing) {
    console.log(`Super admin already exists: ${existing.email} (${existing.id}). Nothing to do.`);
    console.log("To reset the password, use the super admin console's own password-reset flow once logged in.");
    return;
  }

  const password = generateTemporaryPassword();

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: SUPER_ADMIN_EMAIL,
    password,
    email_confirm: true,
  });

  if (authError || !authUser.user) {
    console.error("Failed to create the super admin auth user:", authError?.message);
    process.exitCode = 1;
    return;
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: authUser.user.id,
    system_id: null,
    role: "super_admin",
    name: "Super Admin",
    email: SUPER_ADMIN_EMAIL,
    must_change_password: true,
  });

  if (profileError) {
    console.error("Failed to create the super admin profile row:", profileError.message);
    console.error("The auth user was created but has no matching profile — you may need to delete it via the Supabase dashboard and re-run this script.");
    process.exitCode = 1;
    return;
  }

  console.log("Super admin account created.");
  console.log(`  Email:    ${SUPER_ADMIN_EMAIL}`);
  console.log(`  Password: ${password}`);
  console.log("Log in once and you'll be asked to set your own password (must_change_password is true).");
}

run();
