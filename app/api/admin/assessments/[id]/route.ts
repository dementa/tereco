import { NextRequest } from 'next/server';
import {
  getAssessmentBySystemId,
  getQuestions,
  updateAssessment,
  saveQuestions,
  softDeleteAssessment,
} from '@/lib/assessments';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { requireRole } from '@/lib/auth/session';
import { z } from 'zod';

// Targeting replaces the old targetType/targetValue pair. Each entry narrows
// the audience; an empty array means every student may sit it.
const TargetSchema = z
  .object({
    schoolId: z.string().uuid().nullable().optional(),
    level: z.number().int().min(1).max(7).nullable().optional(),
    classId: z.string().uuid().nullable().optional(),
  })
  .transform((t) => ({
    schoolId: t.schoolId ?? null,
    level: t.level ?? null,
    classId: t.classId ?? null,
  }))
  .refine((t) => t.schoolId !== null || t.level !== null || t.classId !== null, {
    message: 'A target must narrow by school, grade level or class',
  });

const QuestionSchema = z.object({
  questionText: z.string().min(1),
  questionType: z.enum(['mcq', 'checkbox', 'fill', 'matching', 'dragdrop', 'short', 'long']),
  options: z.array(z.string()).default([]),
  correctAnswer: z.string().optional(),
  maxScore: z.number().positive().default(1),
  config: z.unknown().optional(),
});

const UpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  timeLimit: z.number().min(1).optional(),
  opensAt: z.string().nullable().optional(),
  closesAt: z.string().nullable().optional(),
  status: z.enum(['draft', 'published', 'closed']).optional(),
  targets: z.array(TargetSchema).optional(),
  questions: z.array(QuestionSchema).optional(),
});

// [id] is the public ASS#### system id.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  try {
    const { id } = await params;
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse('Assessment not found', 404);

    const questions = await getQuestions(assessment.id);
    return successResponse({ data: { ...assessment, questions } });
  } catch (error) {
    console.error('Error fetching assessment:', error);
    return errorResponse('Failed to fetch assessment', 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  try {
    const { id } = await params;
    const validated = UpdateSchema.parse(await request.json());

    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse('Assessment not found', 404);

    await updateAssessment(id, {
      title: validated.title,
      description: validated.description,
      timeLimit: validated.timeLimit,
      opensAt: validated.opensAt,
      closesAt: validated.closesAt,
      status: validated.status,
      targets: validated.targets,
    });

    if (validated.questions !== undefined) {
      // saveQuestions refuses once anyone has sat the paper — rewriting the
      // questions under existing answers would invalidate every recorded score.
      await saveQuestions(
        assessment.id,
        validated.questions.map((q, i) => ({
          position: i + 1,
          code: `Q${i + 1}`,
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options,
          correctAnswer: q.correctAnswer,
          maxScore: q.maxScore,
          config: q.config,
        }))
      );
    }

    return successResponse({ message: 'Assessment updated' });
  } catch (error) {
    console.error('Error updating assessment:', error);
    return handleApiError(error, 'Update failed');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  try {
    const { id } = await params;
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse('Assessment not found', 404);

    await softDeleteAssessment(id);
    return successResponse({ message: 'Assessment deleted (soft-deleted)' });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    return handleApiError(error, 'Deletion failed');
  }
}
