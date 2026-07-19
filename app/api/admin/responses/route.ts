import { NextRequest } from 'next/server';
import { getResponses, getQuestions, getAssessmentById } from '@/lib/assessments';
import { errorResponse, successResponse } from '@/lib/apiResponse';
import { requireRole } from '@/lib/auth/session';

// GET /api/admin/responses?assessmentId=... – responses + questions for marking
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  const assessmentId = request.nextUrl.searchParams.get('assessmentId');
  if (!assessmentId) {
    return errorResponse('assessmentId is required', 400);
  }
  try {
    const [assessment, responses, questions] = await Promise.all([
      getAssessmentById(assessmentId),
      getResponses(assessmentId),
      getQuestions(assessmentId),
    ]);
    return successResponse({ data: { assessment, responses, questions } });
  } catch (error) {
    console.error('Error fetching responses:', error);
    return errorResponse('Failed to fetch responses', 500);
  }
}
