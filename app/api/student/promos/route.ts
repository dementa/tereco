import { NextRequest } from 'next/server';
import { getStudentPromos } from '@/lib/promos';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { getCurrentProfile } from '@/lib/auth/session';

/**
 * Slides for the student dashboard carousel.
 *
 * Its own route rather than a field on /api/student/performance: the dashboard
 * already fetches that on mount and blocking the whole page on a second query
 * would make the slowest thing on the screen the one the learner did not ask
 * for. The carousel loads independently and renders nothing until it has
 * something to show.
 */
export async function GET(request: NextRequest) {
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse('Unauthorized', 401);
    if (profile.role !== 'student') return errorResponse('Forbidden', 403);

    const slides = await getStudentPromos(profile.id);
    return successResponse({ data: slides });
  } catch (error) {
    return handleApiError(error, 'Failed to load suggestions');
  }
}
