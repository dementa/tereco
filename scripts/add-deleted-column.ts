import { sheets, spreadsheetId } from '../lib/googleSheets';

async function addDeletedColumn() {
  try {
    // Check if column exists
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Assessments!1:1',
    });
    const header = res.data.values?.[0] || [];
    if (header.includes('deleted')) {
      console.log('deleted column already exists.');
      return;
    }
    // Add header
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Assessments!I1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['deleted']] },
    });
    // Set existing rows to FALSE
    const rows = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Assessments!A:H',
    });
    const data = rows.data.values || [];
    if (data.length > 1) {
      const numRows = data.length - 1;
      const falseValues = Array(numRows).fill(['FALSE']);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Assessments!I2:I' + (numRows + 1),
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: falseValues },
      });
    }
    console.log('✅ Added deleted column and set existing rows to FALSE.');
  } catch (error) {
    console.error('Migration error:', error);
  }
}

addDeletedColumn();