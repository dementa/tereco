import dotenv from 'dotenv';
// Load env before anything else
dotenv.config({ path: '.env.local' });

// Now dynamically import the modules we need
async function run() {
  const { hashPasscode } = await import('../lib/hash.js');
  const { ensureUsersSheet } = await import('../lib/googleSheets.js');
  const { google } = await import('googleapis');

  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!privateKey || !clientEmail || !spreadsheetId) {
    console.error('Missing environment variables');
    return;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    await ensureUsersSheet();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Users!A:E',
    });
    const rows = response.data.values || [];
    if (rows.length < 2) {
      console.log('No user rows found.');
      return;
    }
    const updates: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const staffId = row[0];
      const plainPasscode = row[4];
      if (!plainPasscode) continue;
      if (plainPasscode.startsWith('$2a$')) {
        console.log(`Skipping ${staffId} – already hashed.`);
        continue;
      }
      const hashed = await hashPasscode(plainPasscode);
      updates.push({
        range: `Users!E${i + 1}`,
        values: [[hashed]],
      });
    }
    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          data: updates,
          valueInputOption: 'USER_ENTERED',
        },
      });
      console.log(`✅ Migrated ${updates.length} passcodes.`);
    } else {
      console.log('No passcodes to migrate.');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }
}

run();