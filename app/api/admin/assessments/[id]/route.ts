import { NextRequest } from 'next/server';
import {
  getAssessmentById,
  getQuestions,
  updateAssessment,
  saveQuestions,
  softDeleteAssessment,
  Question,
} from '@/lib/assessments';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { z } from 'zod';

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
    const questions = await getQuestions(assessment.id);
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

    const validated = UpdateSchema.parse(body);
    const questions = body.questions as Question[] | undefined;

    const assessment = await getAssessmentById(id);
    if (!assessment) {
      return errorResponse('Assessment not found', 404);
    }

    await updateAssessment(id, validated);

    if (questions !== undefined) {
      await saveQuestions(id, questions);
    }

    return successResponse({ message: 'Assessment updated' });
  } catch (error) {
    console.error('Error updating assessment:', error);
    return handleApiError(error, 'Update failed');
  }
}

// DELETE /api/admin/assessments/[id] – soft-delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const assessment = await getAssessmentById(id);
    if (!assessment) {
      return errorResponse('Assessment not found', 404);
    }

    await softDeleteAssessment(id);

    return successResponse({ message: 'Assessment deleted (soft-deleted)' });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    return handleApiError(error, 'Deletion failed');
  }
}
