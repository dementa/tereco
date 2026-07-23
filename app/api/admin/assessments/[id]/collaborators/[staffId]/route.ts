import { NextRequest } from 'next/server';
import {
  getAssessmentBySystemId,
  getAssessmentCollaborators,
  removeAssessmentCollaborator,
} from '@/lib/assessments';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { getCurrentProfile, requireRole } from '@/lib/auth/session';
import { isAssessmentOwner } from '@/lib/auth/access';

// Only the owner may revoke a collaborator's access — same reasoning as
// granting it: a collaborator cannot manage who else has access.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; staffId: string }> }
) {
  const denied = await requireRole(request, ['admin', 'super_admin', 'staff']);
  if (denied) return denied;
  try {
    const { id, staffId } = await params;
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse('Assessment not found', 404);

    const actor = await getCurrentProfile(request);
    if (!actor || !isAssessmentOwner(actor, assessment)) {
      return errorResponse('Only the creator of this assessment or an admin can remove collaborators.', 403);
    }

    await removeAssessmentCollaborator(assessment.id, staffId);
    const collaborators = await getAssessmentCollaborators(assessment.id);
    return successResponse({ message: 'Collaborator removed', data: collaborators });
  } catch (error) {
    console.error('Error removing collaborator:', error);
    return handleApiError(error, 'Failed to remove collaborator');
  }
}
