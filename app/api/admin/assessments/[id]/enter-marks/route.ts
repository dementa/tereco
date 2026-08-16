import { NextRequest } from 'next/server';
import { z } from 'zod';
import { enterMarksDirectly, getAssessmentBySystemId } from '@/lib/assessments';
import { canMarkAssessment } from '@/lib/auth/access';
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
  // Set by the Behaviour Rating form so a learner already rated can't be
  // silently overwritten by a second teacher — see enterMarksDirectly.
  preventResubmission: z.boolean().optional(),
});

/**
 * Stop-gap for a class with no marks yet: records scores straight into
 * assessment_submissions, bypassing the online-sitting flow entirely. Gated
 * on canMarkAssessment, not canManageAssessment: this records a final score
 * for a learner, which is marking, not editing the paper. That distinction
 * matters for the Behaviour Rating form (see getOrCreateBehaviorAssessment)
 * — its backing assessment is auto-created once per school under whichever
 * teacher happened to trigger it first, so canManageAssessment's
 * owner-or-collaborator check locked every other teacher at that school out
 * with a false "not authorized" error. canMarkAssessment already covers any
 * staff whose school matches one of the assessment's targets, which is
 * exactly the school the behaviour form is scoped to.
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
    if (!actor || !canMarkAssessment(actor, assessment)) {
      return errorResponse('You can only enter marks for assessments you can mark.', 403);
    }

    const { maxScore, entries, preventResubmission } = BodySchema.parse(await request.json());
    const result = await enterMarksDirectly(assessment.id, maxScore, entries, actor.id, { preventResubmission });

    const message =
      result.skipped.length > 0
        ? `Recorded ${result.recorded} learner(s). ${result.skipped.length} already had a rating and were left unchanged.`
        : `Marks recorded for ${result.recorded} learner(s).`;
    return successResponse({ message, data: { recorded: result.recorded, skipped: result.skipped } });
  } catch (error) {
    return handleApiError(error, 'Failed to enter marks');
  }
}
