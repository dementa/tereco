import { google } from 'googleapis';

// --- Environment variables ---
const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');
const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

if (!privateKey || !clientEmail || !spreadsheetId) {
  console.error('Missing Google Sheets environment variables');
}

// --- Authentication ---
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: clientEmail,
    private_key: privateKey,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

/**
 * Append a row to a specific sheet (tab).
 */
export async function appendRow(sheetName: string, values: any[]) {
  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] },
    });
    return response.data;
  } catch (error) {
    console.error('Error appending to Google Sheets:', error);
    throw new Error('Failed to save data');
  }
}

/**
 * Fetch all rows from a sheet (including header).
 */
export async function getRows(sheetName: string) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
    });
    return response.data.values || [];
  } catch (error) {
    console.error('Error reading from Google Sheets:', error);
    throw new Error('Failed to retrieve data');
  }
}

/**
 * Fetch all users from the "Users" sheet.
 * Returns a record: { staffId: { passcode, name, role, school } }
 * Note: 'passcode' holds the **hashed** value.
 * 
 * This version is header‑agnostic: it finds column indices by header name.
 */
export async function getUsersFromSheet(): Promise<Record<string, { passcode: string; name: string; role: string; school: string }>> {
  try {
    await ensureUsersSheet();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Users!A:Z', // read all columns to be safe
    });

    const rows = response.data.values || [];
    if (rows.length < 2) return {};

    // --- Map column names to indices (case‑insensitive) ---
    const header = rows[0];
    const getIndex = (name: string): number => {
      const lower = name.toLowerCase();
      return header.findIndex(h => h && h.toLowerCase().includes(lower));
    };

    const staffIdx = getIndex('staff');
    const passIdx = getIndex('passcode');
    const nameIdx = getIndex('name');
    const roleIdx = getIndex('role');
    const schoolIdx = getIndex('school');

    // Ensure all required columns exist
    if ([staffIdx, passIdx, nameIdx, roleIdx, schoolIdx].some(i => i === -1)) {
      console.error('❌ Missing required columns in Users sheet. Required: Staff ID, PasscodeHash, Name, Role, School');
      return {};
    }

    const users: Record<string, { passcode: string; name: string; role: string; school: string }> = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const staffId = row[staffIdx]?.trim();
      const passcodeHash = row[passIdx]?.trim();
      if (staffId && passcodeHash) {
        users[staffId] = {
          passcode: passcodeHash,
          name: row[nameIdx]?.trim() || '',
          role: row[roleIdx]?.trim() || '',
          school: row[schoolIdx]?.trim() || '',
        };
      }
    }
    return users;
  } catch (error) {
    console.error('Error fetching users from sheet:', error);
    return {};
  }
}

/**
 * Ensure the "Users" sheet exists and has the correct headers.
 * If missing, it creates the sheet and writes the header row.
 * 
 * This ensures a consistent header order for new sheets, but existing sheets can have any column order.
 */
export async function ensureUsersSheet() {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = meta.data.sheets?.some((s) => s.properties?.title === 'Users');

    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'Users' } } }],
        },
      });
      // Use the order you prefer: Staff ID, PasscodeHash, Name, Role, School
      const headers = ['Staff ID', 'PasscodeHash', 'Name', 'Role', 'School'];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Users!A1:E1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [headers] },
      });
    }
  } catch (error) {
    console.error('Error ensuring Users sheet:', error);
    throw new Error('Failed to setup Users sheet');
  }
}