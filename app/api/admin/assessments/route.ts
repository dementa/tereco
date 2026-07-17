import { NextRequest, NextResponse } from 'next/server';
import { getAssessments } from '@/lib/assessment-sheets';
import { sheets, spreadsheetId } from '@/lib/googleSheets';
import { z } from 'zod';

// ─── GET all assessments ─────────────────────────────
export async function GET() {
  try {
    const assessments = await getAssessments(); // no filters
    return NextResponse.json({ success: true, data: assessments });
  } catch (error) {
    console.error('Error fetching assessments:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch assessments' },
      { status: 500 }
    );
  }
}

// ─── POST create a new assessment ─────────────────────
const CreateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  timeLimit: z.number().min(1),
  startTime: z.string().optional(),
  targetType: z.enum(['general', 'class', 'school+class']),
  targetValue: z.string().optional(),
  questionsSheet: z.string().min(1),
  questions: z.array(z.object({
    questionId: z.string().min(1),
    questionText: z.string().min(1),
    type: z.enum(['mcq', 'text']),
    options: z.array(z.string()).optional(),
    correctAnswer: z.string().optional(),
  })).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = CreateSchema.parse(body);

    // Insert assessment metadata
    const assessmentRow = [
      validated.id,
      validated.title,
      validated.description || '',
      validated.timeLimit,
      validated.startTime || '',
      validated.targetType,
      validated.targetValue || '',
      validated.questionsSheet,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Assessments!A:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [assessmentRow] },
    });

    // If questions provided, create the questions sheet
    if (validated.questions && validated.questions.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: validated.questionsSheet } } }],
        },
      });

      const headers = ['questionId', 'questionText', 'type', 'options', 'correctAnswer'];
      const questionRows = validated.questions.map(q => [
        q.questionId,
        q.questionText,
        q.type,
        (q.options || []).join(','),
        q.correctAnswer || '',
      ]);
      questionRows.unshift(headers);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${validated.questionsSheet}!A:E`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: questionRows },
      });
    }

    return NextResponse.json({ success: true, message: 'Assessment created' });
  } catch (error) {
    console.error('Error creating assessment:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Creation failed' },
      { status: 500 }
    );
  }
}