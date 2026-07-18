import { google, sheets_v4 } from "googleapis";

/**
 * Returns an authenticated Google Sheets client.
 */
export function getSheets(): {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
} {
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY
  ?.replace(/\\n/g, "\n")
  .replace(/^"|"$/g, "")
  .trim();
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!privateKey || !clientEmail || !spreadsheetId) {
    throw new Error("Google Sheets environment variables are missing.");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return {
    spreadsheetId,
    sheets: google.sheets({
      version: "v4",
      auth,
    }),
  };
}

/**
 * Ensure a sheet exists. Creates it with headers if missing.
 */
export async function ensureSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  headers: string[]
) {
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const exists = meta.data.sheets?.some(
      (sheet) => sheet.properties?.title === sheetName
    );

    if (exists) return;

    // Create the sheet
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName,
              },
            },
          },
        ],
      },
    });

    // Add headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [headers],
      },
    });
  } catch (error) {
    console.error(`Error ensuring sheet "${sheetName}":`, error);
    throw new Error(`Failed to setup sheet: ${sheetName}`);
  }
}

/**
 * Append one row.
 */
export async function appendRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  row: (string | number)[]
) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [row],
      },
    });
  } catch (error) {
    console.error(`Error appending to sheet "${sheetName}":`, error);
    throw new Error(`Failed to append row to sheet: ${sheetName}`);
  }
}

/**
 * Read all rows.
 */
export async function getRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string
) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
    });

    return response.data.values ?? [];
  } catch (error) {
    console.error(`Error reading from sheet "${sheetName}":`, error);
    throw new Error(`Failed to read from sheet: ${sheetName}`);
  }
}

/**
 * Ensure the "Users" sheet exists and has the correct headers.
 */
export async function ensureUsersSheet() {
  try {
    const { sheets, spreadsheetId } = getSheets();
    
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = meta.data.sheets?.some(
      (s) => s.properties?.title === 'Users'
    );

    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: 'Users',
                },
              },
            },
          ],
        },
      });

      const headers = ['Staff ID', 'PasscodeHash', 'Name', 'Role', 'School'];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Users!A1:E1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headers],
        },
      });
    }
  } catch (error) {
    console.error('Error ensuring Users sheet:', error);
    throw new Error('Failed to setup Users sheet');
  }
}

/**
 * Fetch all users from the "Users" sheet.
 */
export async function getUsersFromSheet(): Promise<
  Record<string, { passcode: string; name: string; role: string; school: string }>
> {
  try {
    await ensureUsersSheet();

    const { sheets, spreadsheetId } = getSheets();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Users!A:Z',
    });

    const rows = response.data.values || [];
    if (rows.length < 2) return {};

    const header = rows[0];
    const getIndex = (name: string): number => {
      const lower = name.toLowerCase();
      return header.findIndex((h) => h && h.toLowerCase().includes(lower));
    };

    const staffIdx = getIndex('staff');
    const passIdx = getIndex('passcode');
    const nameIdx = getIndex('name');
    const roleIdx = getIndex('role');
    const schoolIdx = getIndex('school');

    if ([staffIdx, passIdx, nameIdx, roleIdx, schoolIdx].some((i) => i === -1)) {
      console.error('❌ Missing required columns in Users sheet');
      throw new Error('Users sheet is misconfigured: missing required columns');
    }

    const users: Record<
      string,
      { passcode: string; name: string; role: string; school: string }
    > = {};
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
    throw new Error('Failed to fetch users from sheet');
  }
}