import dotenv from 'dotenv';
// Load env before anything else
dotenv.config({ path: '.env.local' });

// Hashes any plaintext passcodes stored in the Supabase `users` table.
async function run() {
  const { hashPasscode } = await import('../lib/hash.js');
  const { createClient } = await import('@supabase/supabase-js');

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error('Missing Supabase environment variables');
    return;
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await supabase
      .from('users')
      .select('staff_id, passcode_hash');
    if (error) throw error;

    const rows = data ?? [];
    if (rows.length === 0) {
      console.log('No user rows found.');
      return;
    }

    let migrated = 0;
    for (const row of rows) {
      const staffId = row.staff_id as string;
      const passcode = row.passcode_hash as string | null;
      if (!passcode) continue;
      if (passcode.startsWith('$2')) {
        console.log(`Skipping ${staffId} – already hashed.`);
        continue;
      }
      const hashed = await hashPasscode(passcode);
      const { error: updateError } = await supabase
        .from('users')
        .update({ passcode_hash: hashed })
        .eq('staff_id', staffId);
      if (updateError) throw updateError;
      migrated += 1;
    }

    if (migrated > 0) {
      console.log(`✅ Migrated ${migrated} passcodes.`);
    } else {
      console.log('No passcodes to migrate.');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }
}

run();
