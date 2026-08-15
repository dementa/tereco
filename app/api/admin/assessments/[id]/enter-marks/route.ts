import { NextRequest } from 'next/server';
import { z } from 'zod';
import { enterMarksDirectly, getAssessmentBySystemId } from '@/lib/assessments';
import { canManageAssessment } from '@/lib/auth/access';
import { getCurrentProfile, requireRole } from '@/lib/auth/session';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';

const EntrySchema = z.object({
  studentId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  score: z.number().min(0),
});

const BodySchema = z.object({
  maxScore: z.number().positive(),
  entries: z.array(EntrySchema).min(1),
});

/**
 * Stop-gap for a class with no marks yet: records scores straight into
 * assessment_submissions, bypassing the online-sitting flow entirely. Same
 * gate as authoring the assessment (canManageAssessment) — this creates
 * marked, final results, not a routine mark on an existing submission.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ['admin', 'super_admin', 'staff']);
  if (denied) return denied;
  try {
    const { id } = await params;
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse('Assessment not found', 404);

    const actor = await getCurrentProfile(request);
    if (!actor || !canManageAssessment(actor, assessment)) {
      return errorResponse('You can only enter marks for your own assessments.', 403);
    }

    const { maxScore, entries } = BodySchema.parse(await request.json());
    await enterMarksDirectly(assessment.id, maxScore, entries, actor.id);

    return successResponse({ message: `Marks recorded for ${entries.length} learner(s).` });
  } catch (error) {
    return handleApiError(error, 'Failed to enter marks');
  }
}
