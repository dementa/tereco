import { NextRequest } from 'next/server';
import { getResponses, getQuestions, getAssessmentBySystemId } from '@/lib/assessments';
import { errorResponse, successResponse } from '@/lib/apiResponse';
import { getCurrentProfile, requireRole } from '@/lib/auth/session';
import { canMarkAssessment } from '@/lib/auth/access';

// GET /api/admin/responses?assessmentId=... – responses + questions for marking
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ['admin', 'super_admin', 'staff']);
  if (denied) return denied;
  const assessmentId = request.nextUrl.searchParams.get('assessmentId');
  if (!assessmentId) {
    return errorResponse('assessmentId is required', 400);
  }
  try {
    // assessmentId in the query string is the public ASS#### id; the response
    // and question lookups key off the internal uuid.
    const assessment = await getAssessmentBySystemId(assessmentId);
    if (!assessment) return errorResponse('Assessment not found', 404);

    const actor = await getCurrentProfile(request);
    if (!actor || !canMarkAssessment(actor, assessment)) {
      return errorResponse('You can only mark assessments for your own school.', 403);
    }

    const [responses, questions] = await Promise.all([
      getResponses(assessment.id),
      getQuestions(assessment.id),
    ]);
    return successResponse({ data: { assessment, responses, questions } });
  } catch (error) {
    console.error('Error fetching responses:', error);
    return errorResponse('Failed to fetch responses', 500);
  }
}
