import { NextRequest } from 'next/server';
import { getPracticeAttempt } from '@/lib/e-papers';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { getCurrentProfile } from '@/lib/auth/session';

/**
 * A finished practice attempt, with the expected answer for every question.
 *
 * This is the ONLY route that hands `correct_answer` and `model_answer` to a
 * student, and it does so only for an attempt they have already finished.
 * Ownership is enforced inside getPracticeAttempt, next to the data, so there
 * is no way to reach the answers by calling a different helper.
 *
 * A wrong attempt id and someone else's attempt both return 404, not 403 — a
 * 403 would confirm the attempt exists.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await params;

  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse('Unauthorized', 401);
    if (profile.role !== 'student') return errorResponse('Forbidden', 403);

    const result = await getPracticeAttempt(attemptId, profile.id);
    if (!result) return errorResponse('Practice attempt not found', 404);

    return successResponse({ data: result });
  } catch (error) {
    return handleApiError(error, 'Failed to load this practice attempt');
  }
}
