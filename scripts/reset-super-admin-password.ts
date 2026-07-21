import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// One-off: resets the existing super admin's password directly via the
// Supabase service role key, bypassing the app (which requires already being
// logged in as super admin to hit the reset-password endpoint).
// Run: node scripts/reset-super-admin-password.ts

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

  const { data: existing, error: lookupError } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("role", "super_admin")
    .maybeSingle();

  if (lookupError || !existing) {
    console.error("Could not find a super admin profile:", lookupError?.message ?? "no row returned");
    process.exitCode = 1;
    return;
  }

  const password = generateTemporaryPassword();

  const { error: authError } = await supabase.auth.admin.updateUserById(existing.id, {
    password,
  });

  if (authError) {
    console.error("Failed to update the super admin password:", authError.message);
    process.exitCode = 1;
    return;
  }

  await supabase
    .from("profiles")
    .update({ must_change_password: true, updated_at: new Date().toISOString() })
    .eq("id", existing.id);

  console.log("Super admin password reset.");
  console.log(`  Email:    ${existing.email}`);
  console.log(`  Password: ${password}`);
  console.log("Log in with this password — you'll be asked to set your own on first login.");
}

run();
