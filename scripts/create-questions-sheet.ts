import { getSheets }from '../lib/googleSheets';

const { sheets, spreadsheetId } = getSheets();

async function createQuestionsSheet() {
  try {
    // Check if sheet exists
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const exists = meta.data.sheets?.some(s => s.properties?.title === 'Questions');
    if (exists) {
      console.log('Questions sheet already exists.');
      return;
    }
    // Create sheet
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: 'Questions' } } }],
      },
    });
    // Add headers
    const headers = ['assessmentId', 'questionId', 'questionText', 'type', 'options', 'correctAnswer', 'maxScore', 'config'];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Questions!A1:H1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    });
    console.log('✅ Questions sheet created with headers.');
  } catch (error) {
    console.error('Error creating Questions sheet:', error);
  }
}

createQuestionsSheet();