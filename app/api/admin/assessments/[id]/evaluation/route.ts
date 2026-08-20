import { NextRequest } from 'next/server';
import { getAssessmentBySystemId, setAssessmentEvaluation } from '@/lib/assessments';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { requireSuperAdmin } from '@/lib/auth/session';
import { z } from 'zod';

const BodySchema = z.object({ includeInEvaluation: z.boolean() });

/**
 * Include/exclude is strictly super_admin — not admin, not the paper's own
 * creator. Same reasoning as hide/unhide: a platform-wide "does this count"
 * switch, unrelated to authorship, so ownership doesn't factor in.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const { includeInEvaluation } = BodySchema.parse(await request.json());

    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse('Assessment not found', 404);

    await setAssessmentEvaluation(id, includeInEvaluation);

    return successResponse({
      message: includeInEvaluation ? 'Included in evaluation' : 'Excluded from evaluation',
    });
  } catch (error) {
    console.error('Error updating assessment evaluation setting:', error);
    return handleApiError(error, 'Could not update evaluation setting');
  }
}
