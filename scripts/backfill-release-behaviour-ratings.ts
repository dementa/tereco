import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// One-off: every school's "Behaviour Rating" assessment was created hidden
// (see getOrCreateBehaviorAssessment) and hidden assessments never appear in
// any "Release results" list, so results_released_at could never be set
// through the app. Each rating is written already "marked" the instant a
// teacher submits it, so there's nothing a manual release was protecting —
// this just sets the field directly, bypassing releaseResults() so it
// doesn't fire a results_released notification for every historical rating.
// Run: npx tsx scripts/backfill-release-behaviour-ratings.ts

async function run() {
  const { createClient } = await import("@supabase/supabase-js");

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

  const { data: rows, error: selectError } = await supabase
    .from("assessments")
    .select("id, system_id, created_by, results_released_at")
    .eq("title", "Behaviour Rating")
    .is("deleted_at", null)
    .is("results_released_at", null);
  if (selectError) {
    console.error("Lookup failed:", selectError.message);
    process.exitCode = 1;
    return;
  }

  if (!rows || rows.length === 0) {
    console.log("Nothing to backfill — every Behaviour Rating assessment is already released.");
    return;
  }

  console.log(`Releasing ${rows.length} unreleased Behaviour Rating assessment(s)...`);
  const now = new Date().toISOString();
  for (const row of rows) {
    const { error } = await supabase
      .from("assessments")
      .update({ results_released_at: now, results_released_by: row.created_by })
      .eq("id", row.id);
    if (error) {
      console.error(`  ${row.system_id}: FAILED — ${error.message}`);
      continue;
    }
    console.log(`  ${row.system_id}: released`);
  }
}

run();
