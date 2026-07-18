import { NextRequest, NextResponse } from 'next/server';
import {
  getAssessmentById,
  getQuestions,
  updateAssessment,
  saveQuestions,
  softDeleteAssessment,
  Question,
  QuestionType,
} from '@/lib/assessments';
import { requireAdmin } from '@/lib/adminAuth';
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
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await request.json();

    const validated = UpdateSchema.parse(body);

    // Validate the optional `questions` array instead of trusting the payload.
    const questions: Question[] | undefined =
      body.questions === undefined
        ? undefined
        : QuestionsArraySchema.parse(body.questions).map((q) => ({
            questionId: q.questionId,
            questionText: q.questionText,
            questionType: q.questionType as QuestionType,
            options: q.options ?? [],
            correctAnswer: q.correctAnswer,
            maxScore: 1,
          }));

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
      { success: false, message: 'Update failed' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/assessments/[id] – soft-delete
export async function DELETE(
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

    await softDeleteAssessment(id);

    return NextResponse.json({ success: true, message: 'Assessment deleted (soft-deleted)' });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    return NextResponse.json(
      { success: false, message: 'Deletion failed' },
      { status: 500 }
    );
  }
}
