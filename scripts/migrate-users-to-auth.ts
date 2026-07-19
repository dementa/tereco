import dotenv from "dotenv";
import { readFileSync, existsSync } from "fs";
dotenv.config({ path: ".env.local" });

// One-time (but re-runnable) migration of the legacy `users` table (bcrypt
// passcodes, staff_id-based) into Supabase Auth + profiles. Existing bcrypt
// hashes can't carry over, so every migrated account gets a fresh
// system-generated password and must_change_password = true.
//
// Requires scripts/migration-emails.csv with lines: staff_id,email
// Rows with no matching email are skipped (not guessed/invented) and can be
// picked up on a re-run once you add them to the CSV — already-migrated
// staff_ids (tracked via user_metadata.migrated_from_staff_id) are skipped
// too, so this is safe to run more than once.
//
// Run: node scripts/migrate-users-to-auth.ts

const CSV_PATH = "scripts/migration-emails.csv";

interface LegacyUserRow {
  staff_id: string;
  name: string | null;
  role: string | null;
  school: string | null;
}

function loadEmailMap(): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(CSV_PATH)) {
    console.error(`Missing ${CSV_PATH}. Create it with lines: staff_id,email`);
    return map;
  }
  const lines = readFileSync(CSV_PATH, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [staffId, email] = trimmed.split(",").map((s) => s.trim());
    if (staffId && email) map.set(staffId, email);
  }
  return map;
}

async function run() {
  const { createClient } = await import("@supabase/supabase-js");
  const { generateTemporaryPassword } = await import("../lib/auth/password.ts");
  const { generateSystemId } = await import("../lib/idGenerator.ts");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("Missing Supabase environment variables.");
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const emailMap = loadEmailMap();
  if (emailMap.size === 0) {
    console.error("No email mappings loaded — nothing to migrate.");
    process.exitCode = 1;
    return;
  }

  const { data: superAdmin } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "super_admin")
    .maybeSingle();

  const { data: legacyUsers, error: legacyError } = await supabase
    .from("users")
    .select("staff_id, name, role, school");

  if (legacyError) {
    console.error("Failed to read legacy users table:", legacyError.message);
    process.exitCode = 1;
    return;
  }

  const report: { staffId: string; systemId: string; email: string; password: string }[] = [];
  const skipped: string[] = [];

  for (const row of (legacyUsers ?? []) as LegacyUserRow[]) {
    const email = emailMap.get(row.staff_id);
    if (!email) {
      skipped.push(`${row.staff_id} — no email in ${CSV_PATH}`);
      continue;
    }

    const { data: alreadyMigrated } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (alreadyMigrated) {
      skipped.push(`${row.staff_id} — already migrated (${email})`);
      continue;
    }

    const role = row.role === "admin" ? "admin" : "staff";
    const password = generateTemporaryPassword();

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { migrated_from_staff_id: row.staff_id },
    });
    if (authError || !authUser.user) {
      skipped.push(`${row.staff_id} — auth.admin.createUser failed: ${authError?.message}`);
      continue;
    }

    const systemId = await generateSystemId(role);

    let schoolId: string | null = null;
    if (row.school) {
      const { data: school } = await supabase
        .from("schools")
        .select("id")
        .eq("name", row.school)
        .maybeSingle();
      schoolId = school?.id ?? null;
      if (!schoolId) {
        console.warn(`  Warning: no matching school row for "${row.school}" (${row.staff_id}) — school_id left null.`);
      }
    }

    const { error: profileError } = await supabase.from("profiles").insert({
      id: authUser.user.id,
      system_id: systemId,
      role,
      name: row.name ?? "",
      email,
      school_id: schoolId,
      must_change_password: true,
      created_by: superAdmin?.id ?? null,
    });

    if (profileError) {
      skipped.push(`${row.staff_id} — profile insert failed: ${profileError.message}`);
      continue;
    }

    report.push({ staffId: row.staff_id, systemId, email, password });
  }

  console.log("\n=== Migrated ===");
  console.table(report);
  console.log("\nHand-deliver these credentials personally (not emailed by this script).");

  if (skipped.length) {
    console.log("\n=== Skipped ===");
    skipped.forEach((s) => console.log(`  ${s}`));
  }
}

run();
