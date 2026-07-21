import { NextRequest } from 'next/server';
import { getAssessmentBySystemId, getQuestions, saveQuestions } from '@/lib/assessments';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { requireRole } from '@/lib/auth/session';
import { z } from 'zod';

// position/code are NOT accepted from the client — they are assigned from array
// order (Q1, Q2, ...) so they can never be mistyped, duplicated or raced.
const QuestionSchema = z.object({
  questionText: z.string().min(1),
  questionType: z.enum([
    'mcq', 'checkbox', 'true_false', 'fill', 'matching', 'dragdrop', 'short', 'long',
  ]),
  options: z.array(z.string()).default([]),
  correctAnswer: z.string().optional(),
  // Expected answer / mark split for hand-marked questions.
  modelAnswer: z.string().optional(),
  imageUrl: z.string().url().optional(),
  imagePublicId: z.string().optional(),
  maxScore: z.number().positive().default(1),
  config: z.unknown().optional(),
});

const SaveQuestionsSchema = z.object({
  questions: z.array(QuestionSchema),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  const { id } = await params;
  try {
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse('Assessment not found', 404);

    const questions = await getQuestions(assessment.id);
    return successResponse({ data: questions });
  } catch (error) {
    console.error('Error fetching questions:', error);
    return errorResponse('Failed to fetch questions', 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  const { id } = await params;
  try {
    const validated = SaveQuestionsSchema.parse(await request.json());

    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse('Assessment not found', 404);

    await saveQuestions(
      assessment.id,
      validated.questions.map((q, i) => ({
        position: i + 1,
        code: `Q${i + 1}`,
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options,
        correctAnswer: q.correctAnswer,
        modelAnswer: q.modelAnswer,
        imageUrl: q.imageUrl,
        imagePublicId: q.imagePublicId,
        maxScore: q.maxScore,
        config: q.config,
      }))
    );
    return successResponse({ message: 'Questions saved' });
  } catch (error) {
    console.error('Error saving questions:', error);
    return handleApiError(error, 'Save failed');
  }
}
