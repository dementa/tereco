import { NextRequest } from 'next/server';
import { getAssessmentBySystemId, getQuestions, saveQuestions } from '@/lib/assessments';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { getCurrentProfile, requireRole } from '@/lib/auth/session';
import { canManageAssessment } from '@/lib/auth/access';
import { z } from 'zod';

// section/groupId/groupKind/groupImageTitle — see lib/questionGrouping.ts.
// Purely authoring-structure metadata: never marking data.
const QuestionConfigSchema = z
  .object({
    section: z.string().trim().max(4).optional(),
    groupId: z.string().optional(),
    groupKind: z.enum(['relative', 'sub']).optional(),
    groupImageTitle: z.string().trim().max(200).optional(),
  })
  .strict()
  .optional();

// position/code are NOT accepted from the client — saveQuestions() computes
// them itself (see lib/questionGrouping.ts's computeCodes), so they can never
// be mistyped, duplicated, raced, or left out of step with a question's group.
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
  config: QuestionConfigSchema,
});

const SaveQuestionsSchema = z.object({
  questions: z.array(QuestionSchema),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ['admin', 'super_admin', 'staff']);
  if (denied) return denied;
  const { id } = await params;
  try {
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse('Assessment not found', 404);

    const actor = await getCurrentProfile(request);
    if (!actor || !canManageAssessment(actor, assessment)) {
      return errorResponse('You can only work with assessments you created.', 403);
    }

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
  const denied = await requireRole(request, ['admin', 'super_admin', 'staff']);
  if (denied) return denied;
  const { id } = await params;
  try {
    const validated = SaveQuestionsSchema.parse(await request.json());

    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse('Assessment not found', 404);

    const actor = await getCurrentProfile(request);
    if (!actor || !canManageAssessment(actor, assessment)) {
      return errorResponse('You can only work with assessments you created.', 403);
    }

    await saveQuestions(
      assessment.id,
      validated.questions.map((q) => ({
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
