import { NextRequest, NextResponse } from 'next/server';
import { getAssessmentById, getQuestions } from '@/lib/assessment-sheets';
import { getSheets } from '@/lib/googleSheets';
import { requireAdmin } from '@/lib/adminAuth';
import { z } from 'zod';

const {spreadsheetId, sheets} = getSheets();

const UpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  timeLimit: z.number().min(1).optional(),
  startTime: z.string().optional(),
  targetType: z.enum(['general', 'class', 'school+class']).optional(),
  targetValue: z.string().optional(),
  questionsSheet: z.string().optional(),
});

const QuestionInputSchema = z.object({
  questionId: z.string().min(1),
  questionText: z.string().min(1),
  questionType: z.string().min(1),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().optional(),
});

const QuestionsArraySchema = z.array(QuestionInputSchema);

// GET /api/admin/assessments/[id] – get single assessment with questions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const assessment = await getAssessmentById(id);
    if (!assessment) {
      return NextResponse.json(
        { success: false, message: 'Assessment not found' },
        { status: 404 }
      );
    }
    const questions = await getQuestions(assessment.questionsSheet);
    return NextResponse.json({ success: true, data: { ...assessment, questions } });
  } catch (error) {
    console.error('Error fetching assessment:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch assessment' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/assessments/[id] – update assessment metadata and optionally questions
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate the update fields
    const validated = UpdateSchema.parse(body);

    // Validate the optional `questions` array instead of trusting the payload.
    const questions =
      body.questions === undefined
        ? undefined
        : QuestionsArraySchema.parse(body.questions);

    // Read the current assessment
    const assessment = await getAssessmentById(id);
    if (!assessment) {
      return NextResponse.json(
        { success: false, message: 'Assessment not found' },
        { status: 404 }
      );
    }

    // Update metadata in the Assessments sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Assessments!A:H',
    });
    const rows = response.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json(
        { success: false, message: 'No assessments found' },
        { status: 404 }
      );
    }

    const headers = rows[0];
    const idIdx = headers.indexOf('id');
    const rowIndex = rows.findIndex((row, idx) => idx > 0 && row[idIdx] === id);
    if (rowIndex === -1) {
      return NextResponse.json(
        { success: false, message: 'Assessment not found' },
        { status: 404 }
      );
    }

    const existingRow = rows[rowIndex];
    const updatedRow = [...existingRow];
    const map: { [key: string]: number } = {};
    headers.forEach((h: string, i: number) => map[h] = i);

    if (validated.title !== undefined) updatedRow[map.title] = validated.title;
    if (validated.description !== undefined) updatedRow[map.description] = validated.description;
    if (validated.timeLimit !== undefined) updatedRow[map.timeLimit] = validated.timeLimit.toString();
    if (validated.startTime !== undefined) updatedRow[map.startTime] = validated.startTime;
    if (validated.targetType !== undefined) updatedRow[map.targetType] = validated.targetType;
    if (validated.targetValue !== undefined) updatedRow[map.targetValue] = validated.targetValue;
    if (validated.questionsSheet !== undefined) {
      updatedRow[map.questionsSheet] = validated.questionsSheet;
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Assessments!A${rowIndex + 1}:H${rowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedRow] },
    });

    // If questions are provided, update the questions sheet
    if (questions !== undefined) {
      // Delete the existing sheet
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetExists = meta.data.sheets?.some(s => s.properties?.title === assessment.questionsSheet);
      if (sheetExists) {
        const sheetId = meta.data.sheets!.find(s => s.properties?.title === assessment.questionsSheet)!.properties!.sheetId!;
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ deleteSheet: { sheetId } }] },
        });
      }

      // Create a new sheet with updated questions
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: assessment.questionsSheet } } }] },
      });

      const headersRow = ['questionId', 'questionText', 'type', 'options', 'correctAnswer'];
      const questionRows = questions.map(q => [
        q.questionId,
        q.questionText,
        q.questionType,
        (q.options || []).join(','),
        q.correctAnswer || '',
      ]);
      questionRows.unshift(headersRow);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${assessment.questionsSheet}!A:E`,
        valueInputOption: 'RAW',
        requestBody: { values: questionRows },
      });
    }

    return NextResponse.json({ success: true, message: 'Assessment updated' });
  } catch (error) {
    console.error('Error updating assessment:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, message: 'Update failed' },
      { status: 500 }
    );
  }
}


// DELETE /api/admin/assessments/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    
    // 1. Get the current data and headers
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Assessments!A:Z', // read all columns
    });
    const rows = response.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json(
        { success: false, message: 'No assessments found' },
        { status: 404 }
      );
    }
    const headers = rows[0];
    let idIdx = headers.indexOf('id');
    let deletedIdx = headers.indexOf('deleted');

    // If no deleted column, add it now
    if (deletedIdx === -1) {
      // Append a new header
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Assessments!${String.fromCharCode(65 + headers.length)}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['deleted']] },
      });
      // Re-fetch the headers to get the new column index
      const newResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Assessments!1:1',
      });
      const newHeaders = newResponse.data.values?.[0] || [];
      deletedIdx = newHeaders.indexOf('deleted');
      // Also set default FALSE for all existing rows
      const rowCount = rows.length - 1;
      if (rowCount > 0) {
        const falseValues = Array(rowCount).fill(['FALSE']);
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Assessments!${String.fromCharCode(65 + deletedIdx)}2:${String.fromCharCode(65 + deletedIdx)}${rowCount + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: falseValues },
        });
      }
      // Now re-fetch the rows to get the updated data
      const fullResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Assessments!A:Z',
      });
      const fullRows = fullResponse.data.values || [];
      if (fullRows.length < 2) {
        return NextResponse.json(
          { success: false, message: 'No assessments found' },
          { status: 404 }
        );
      }
      // Re-map indices
      const fullHeaders = fullRows[0];
      idIdx = fullHeaders.indexOf('id');
      deletedIdx = fullHeaders.indexOf('deleted');
      // Find the row index again
      const rowIndex = fullRows.findIndex((row, idx) => idx > 0 && row[idIdx] === id);
      if (rowIndex === -1) {
        return NextResponse.json(
          { success: false, message: 'Assessment not found' },
          { status: 404 }
        );
      }
      // Set deleted = TRUE
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Assessments!${String.fromCharCode(65 + deletedIdx)}${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['TRUE']] },
      });
    } else {
      // deleted column exists, find the row
      const rowIndex = rows.findIndex((row, idx) => idx > 0 && row[idIdx] === id);
      if (rowIndex === -1) {
        return NextResponse.json(
          { success: false, message: 'Assessment not found' },
          { status: 404 }
        );
      }
      // Set deleted = TRUE
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Assessments!${String.fromCharCode(65 + deletedIdx)}${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['TRUE']] },
      });
    }

    return NextResponse.json({ success: true, message: 'Assessment deleted (soft-deleted)' });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    return NextResponse.json(
      { success: false, message: 'Deletion failed' },
      { status: 500 }
    );
  }
}