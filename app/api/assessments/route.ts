import { NextRequest } from 'next/server';
import { getAssessments, getAssessmentsForStudent } from '@/lib/assessments';
import { errorResponse, successResponse } from '@/lib/apiResponse';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse('Unauthorized', 401);

    // A student gets exactly the papers targeting says they may sit — evaluated
    // by the database, not by school/class strings passed in the query.
    const assessments =
      profile.role === 'student'
        ? await getAssessmentsForStudent(profile.id)
        : await getAssessments();

    return successResponse({ data: assessments });
  } catch (error) {
    console.error('Error in /api/assessments:', error);
    return errorResponse('Failed to fetch assessments', 500);
  }
}
