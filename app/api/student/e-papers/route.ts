import { NextRequest } from 'next/server';
import { getEPapersForStudent } from '@/lib/e-papers';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { getCurrentProfile } from '@/lib/auth/session';

/**
 * The closed papers this learner may practise, for the Library's E-Papers tab.
 *
 * Students only. Eligibility comes from `e_papers_for_student`, which joins
 * `enrollments` rather than `current_enrollments` — so a promoted learner still
 * sees last year's papers, which is the entire point of the feature.
 */
export async function GET(request: NextRequest) {
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse('Unauthorized', 401);
    if (profile.role !== 'student') return errorResponse('Forbidden', 403);

    const papers = await getEPapersForStudent(profile.id);
    return successResponse({ data: papers });
  } catch (error) {
    return handleApiError(error, 'Failed to load practice papers');
  }
}
