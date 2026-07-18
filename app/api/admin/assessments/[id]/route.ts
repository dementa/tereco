import { NextRequest, NextResponse } from 'next/server';
import {
  getAssessmentById,
  getQuestions,
  updateAssessment,
  saveQuestions,
  softDeleteAssessment,
  Question,
} from '@/lib/assessments';
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
      return NextResponse.json(
        { success: false, message: 'Assessment not found' },
        { status: 404 }
      );
    }
    const questions = await getQuestions(assessment.id);
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
  try {
    const { id } = await params;
    const body = await request.json();

    const validated = UpdateSchema.parse(body);
    const questions = body.questions as Question[] | undefined;

    const assessment = await getAssessmentById(id);
    if (!assessment) {
      return NextResponse.json(
        { success: false, message: 'Assessment not found' },
        { status: 404 }
      );
    }

    await updateAssessment(id, validated);

    if (questions !== undefined) {
      await saveQuestions(id, questions);
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
      { success: false, message: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
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
      return NextResponse.json(
        { success: false, message: 'Assessment not found' },
        { status: 404 }
      );
    }

    await softDeleteAssessment(id);

    return NextResponse.json({ success: true, message: 'Assessment deleted (soft-deleted)' });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Deletion failed' },
      { status: 500 }
    );
  }
}
