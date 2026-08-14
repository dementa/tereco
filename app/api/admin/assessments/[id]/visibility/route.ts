import { NextRequest } from 'next/server';
import { getAssessmentBySystemId, hideAssessment, unhideAssessment } from '@/lib/assessments';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { requireSuperAdmin } from '@/lib/auth/session';
import { z } from 'zod';

const BodySchema = z.object({ hidden: z.boolean() });

/**
 * Hide/unhide is strictly super_admin — not admin, not the paper's own
 * creator. Unlike edit/delete (canManageAssessment/isAssessmentOwner), this
 * has nothing to do with authorship: it's a platform-wide "keep this out of
 * everyone's way" switch, so ownership doesn't factor in at all.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const { hidden } = BodySchema.parse(await request.json());

    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse('Assessment not found', 404);

    if (hidden) await hideAssessment(id);
    else await unhideAssessment(id);

    return successResponse({ message: hidden ? 'Assessment hidden' : 'Assessment unhidden' });
  } catch (error) {
    console.error('Error updating assessment visibility:', error);
    return handleApiError(error, 'Could not update visibility');
  }
}
