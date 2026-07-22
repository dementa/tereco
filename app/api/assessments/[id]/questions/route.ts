import { NextRequest } from 'next/server';
import {
  getAssessmentBySystemId,
  getAssessmentsForStudent,
  getQuestions,
} from '@/lib/assessments';
import { errorResponse, successResponse } from '@/lib/apiResponse';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // This route used to be unauthenticated, which handed the full paper — every
  // question, for any assessment including drafts — to anyone who could guess
  // an ASS#### id.
  const profile = await getCurrentProfile(request);
  if (!profile) return errorResponse('Unauthorized', 401);

  try {
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) {
      return errorResponse('Assessment not found', 404);
    }

    // Students get a paper only while they may actually sit it. Eligibility is
    // read from `assessments_for_student`, the same database function that
    // builds their list, so the page they can open and the list they are shown
    // can never disagree. Staff and admins are handling papers by their role
    // and are not narrowed by targeting.
    if (profile.role === 'student') {
      const eligible = await getAssessmentsForStudent(profile.id);
      if (!eligible.some((a) => a.id === assessment.id)) {
        // The overwhelmingly common reason, and the only one the learner can do
        // anything about, is that they have already sat it. Saying so beats a
        // bare 403 that reads like a bug.
        return errorResponse(
          'This assessment is no longer available to you. If you have already sat it, your result is under Results.',
          403
        );
      }
    }

    const questions = await getQuestions(assessment.id);

    // Never expose correctAnswer / config to students.
    const safeQuestions = questions.map((q) => ({
      id: q.id,
      code: q.code,
      position: q.position,
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options,
      maxScore: q.maxScore,
    }));

    return successResponse({ data: safeQuestions });
  } catch (error) {
    console.error('Error fetching questions:', error);
    return errorResponse('Failed to fetch questions', 500);
  }
}
