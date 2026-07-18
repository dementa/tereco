import { NextRequest } from 'next/server';
import {
  getAssessmentById,
  getQuestions,
  Question,
  writeAssessmentQuestionsSheet,
} from '@/lib/assessment-sheets';
import { columnLetter, getSheets } from '@/lib/googleSheets';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
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

// GET /api/admin/assessments/[id] – get single assessment with questions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const assessment = await getAssessmentById(id);
    if (!assessment) {
      return errorResponse('Assessment not found', 404);
    }
    const questions = await getQuestions(assessment.questionsSheet);
    return successResponse({ data: { ...assessment, questions } });
  } catch (error) {
    console.error('Error fetching assessment:', error);
    return errorResponse('Failed to fetch assessment', 500);
  }
}

// PUT /api/admin/assessments/[id] – update assessment metadata and optionally questions
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate the update fields
    const validated = UpdateSchema.parse(body);

    // We'll also allow a `questions` array
    const questions = body.questions as Question[] | undefined;

    // Read the current assessment
    const assessment = await getAssessmentById(id);
    if (!assessment) {
      return errorResponse('Assessment not found', 404);
    }

    // Update metadata in the Assessments sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Assessments!A:H',
    });
    const rows = response.data.values || [];
    if (rows.length < 2) {
      return errorResponse('No assessments found', 404);
    }

    const headers = rows[0];
    const idIdx = headers.indexOf('id');
    const rowIndex = rows.findIndex((row, idx) => idx > 0 && row[idIdx] === id);
    if (rowIndex === -1) {
      return errorResponse('Assessment not found', 404);
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
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [updatedRow] },
    });

    // If questions are provided, update the questions sheet
    if (questions !== undefined) {
      await writeAssessmentQuestionsSheet(assessment.questionsSheet, questions);
    }

    return successResponse({ message: 'Assessment updated' });
  } catch (error) {
    console.error('Error updating assessment:', error);
    return handleApiError(error, 'Update failed');
  }
}


// DELETE /api/admin/assessments/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // 1. Get the current data and headers
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Assessments!A:Z', // read all columns
    });
    const rows = response.data.values || [];
    if (rows.length < 2) {
      return errorResponse('No assessments found', 404);
    }
    const headers = rows[0];
    let idIdx = headers.indexOf('id');
    let deletedIdx = headers.indexOf('deleted');

    // If no deleted column, add it now
    if (deletedIdx === -1) {
      // Append a new header
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Assessments!${columnLetter(headers.length)}1`,
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
          range: `Assessments!${columnLetter(deletedIdx)}2:${columnLetter(deletedIdx)}${rowCount + 1}`,
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
        return errorResponse('No assessments found', 404);
      }
      // Re-map indices
      const fullHeaders = fullRows[0];
      idIdx = fullHeaders.indexOf('id');
      deletedIdx = fullHeaders.indexOf('deleted');
      // Find the row index again
      const rowIndex = fullRows.findIndex((row, idx) => idx > 0 && row[idIdx] === id);
      if (rowIndex === -1) {
        return errorResponse('Assessment not found', 404);
      }
      // Set deleted = TRUE
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Assessments!${columnLetter(deletedIdx)}${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['TRUE']] },
      });
    } else {
      // deleted column exists, find the row
      const rowIndex = rows.findIndex((row, idx) => idx > 0 && row[idIdx] === id);
      if (rowIndex === -1) {
        return errorResponse('Assessment not found', 404);
      }
      // Set deleted = TRUE
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Assessments!${columnLetter(deletedIdx)}${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['TRUE']] },
      });
    }

    return successResponse({ message: 'Assessment deleted (soft-deleted)' });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    return handleApiError(error, 'Deletion failed');
  }
}