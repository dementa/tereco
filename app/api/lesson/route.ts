import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { z } from 'zod';

// --- Environment ---
const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');
const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

if (!privateKey || !clientEmail || !spreadsheetId) {
  console.error('Missing Google Sheets environment variables');
}

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: clientEmail, private_key: privateKey },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// --- Validation ---
const LessonSchema = z.object({
  school: z.string(),
  class: z.string(),
  date: z.string(),
  period: z.string(),
  status: z.string(),
  missedReason: z.string().optional(),
  explanation: z.string().optional(),
  learningArea: z.string(),
  specificSkill: z.string(),
  lessonApproach: z.string(),
  present: z.number(),
  absent: z.number(),
  computerAccess: z.string(),
  overallProgress: z.string(),
  achievement: z.string(),
  challenges: z.string(),
  supportRequired: z.string().optional(),
});

// --- Helper: Ensure the sheet exists ---
async function ensureSheetExists(sheetName: string) {
  try {
    // Get spreadsheet metadata to list all sheets
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = meta.data.sheets?.some(
      (s) => s.properties?.title === sheetName
    );

    if (!sheetExists) {
      // Create the sheet with a batchUpdate
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: sheetName },
              },
            },
          ],
        },
      });

      // Add the header row
      const headers = [
        'School', 'Class', 'Date', 'Period', 'Status',
        'Missed Reason', 'Explanation', 'Learning Area',
        'Specific Skill', 'Lesson Approach', 'Present',
        'Absent', 'Computer Access', 'Overall Progress',
        'Achievement', 'Challenges', 'Support Required',
        'Timestamp'
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:R1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [headers] },
      });
    }
  } catch (error) {
    console.error('Error ensuring sheet exists:', error);
    throw new Error('Failed to setup sheet');
  }
}

// --- POST handler ---
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = LessonSchema.parse(body);

    const sheetName = 'LessonRecords';
    await ensureSheetExists(sheetName);

    const row = [
      validated.school,
      validated.class,
      validated.date,
      validated.period,
      validated.status,
      validated.missedReason || '',
      validated.explanation || '',
      validated.learningArea,
      validated.specificSkill,
      validated.lessonApproach,
      validated.present,
      validated.absent,
      validated.computerAccess,
      validated.overallProgress,
      validated.achievement,
      validated.challenges,
      validated.supportRequired || '',
      new Date().toISOString(),
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });

    return NextResponse.json({ success: true, message: 'Lesson saved' });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}