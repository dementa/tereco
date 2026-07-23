import { NextRequest } from 'next/server';
import { getAssessmentForResponse, updateResponseScore } from '@/lib/assessments';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { getCurrentProfile, requireRole } from '@/lib/auth/session';
import { canMarkAssessment } from '@/lib/auth/access';
import { z } from 'zod';

const ScoreSchema = z.object({
  score: z.number().min(0),
});

// PATCH /api/admin/responses/[id] – manual marking of a single response
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ['admin', 'super_admin', 'staff']);
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await request.json();
    const { score } = ScoreSchema.parse(body);
    const marker = await getCurrentProfile(request);
    if (!marker) return errorResponse('Unauthorized', 401);

    // The response id alone says nothing about who owns the paper it belongs
    // to, so resolve the assessment before allowing a score to be written.
    const assessment = await getAssessmentForResponse(id);
    if (!assessment) return errorResponse('Response not found', 404);
    if (!canMarkAssessment(marker, assessment)) {
      return errorResponse('You can only mark assessments for your own school.', 403);
    }
    // Who marked it is recorded, not inferred later.
    await updateResponseScore(id, score, marker.id);
    return successResponse({ message: 'Score updated' });
  } catch (error) {
    return handleApiError(error, 'Update failed');
  }
}
