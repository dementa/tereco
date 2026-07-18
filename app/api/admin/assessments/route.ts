import { NextRequest } from 'next/server';
import { getAssessments, writeAssessmentQuestionsSheet } from '@/lib/assessment-sheets';
import { getSheets } from '@/lib/googleSheets';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { z } from 'zod';

const { sheets, spreadsheetId } = getSheets();

// ─── GET all assessments ─────────────────────────────
export async function GET() {
  try {
    const assessments = await getAssessments(); // no filters
    return successResponse({ data: assessments });
  } catch (error) {
    console.error('Error fetching assessments:', error);
    return errorResponse('Failed to fetch assessments', 500);
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
    questionType: z.enum(['mcq', 'text']),
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
      await writeAssessmentQuestionsSheet(validated.questionsSheet, validated.questions);
    }

    return successResponse({ message: 'Assessment created' });
  } catch (error) {
    console.error('Error creating assessment:', error);
    return handleApiError(error, 'Creation failed');
  }
}
