import { NextRequest } from 'next/server';
import {
  getAssessmentBySystemId,
  getAssessmentCollaborators,
  addAssessmentCollaborator,
} from '@/lib/assessments';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { getCurrentProfile, requireRole } from '@/lib/auth/session';
import { canManageAssessment, isAssessmentOwner } from '@/lib/auth/access';
import { z } from 'zod';

// GET — anyone who can already work with the assessment (owner or an
// existing collaborator) may see who else has access.
export async function GET(
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
      return errorResponse('You can only work with assessments for your own school.', 403);
    }

    const collaborators = await getAssessmentCollaborators(assessment.id);
    return successResponse({ data: collaborators });
  } catch (error) {
    console.error('Error fetching collaborators:', error);
    return errorResponse('Failed to fetch collaborators', 500);
  }
}

const AddSchema = z.object({
  identifier: z.string().trim().min(1),
});

// POST — only the owner (the assessment's own author, or an admin) may add
// a collaborator. A collaborator cannot deputise further on their own.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ['admin', 'super_admin', 'staff']);
  if (denied) return denied;
  try {
    const { id } = await params;
    const { identifier } = AddSchema.parse(await request.json());

    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse('Assessment not found', 404);

    const actor = await getCurrentProfile(request);
    if (!actor || !isAssessmentOwner(actor, assessment)) {
      return errorResponse('Only the creator of this assessment or an admin can add collaborators.', 403);
    }

    // Same identifier resolution as login: a system ID or an email.
    const admin = getSupabaseAdmin();
    const query = admin
      .from('profiles')
      .select('id, first_name, last_name, role, is_active')
      .eq('is_active', true);
    const { data: candidate } = identifier.includes('@')
      ? await query.eq('email', identifier).maybeSingle()
      : await query.eq('system_id', identifier).maybeSingle();

    if (!candidate) {
      return errorResponse('No active account found for that System ID or email.', 404);
    }
    if (candidate.role !== 'staff') {
      return errorResponse('Collaborators must be a teacher (staff) account.', 400);
    }

    await addAssessmentCollaborator(assessment.id, candidate.id, actor.id);
    const collaborators = await getAssessmentCollaborators(assessment.id);
    return successResponse({ message: 'Collaborator added', data: collaborators });
  } catch (error) {
    console.error('Error adding collaborator:', error);
    return handleApiError(error, 'Failed to add collaborator');
  }
}
