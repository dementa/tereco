import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAssessmentBySystemId } from '@/lib/assessments';
import { canPractise, recordPracticeAttempt } from '@/lib/e-papers';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { getCurrentProfile } from '@/lib/auth/session';
import { getCurrentEnrollment } from '@/lib/entities/enrollments';

/**
 * Finish a practice attempt.
 *
 * Deliberately different from the live submit route in three ways, each of
 * which is the feature rather than an omission:
 *
 *   - No time check. Practice is untimed; thinking for an hour is the point.
 *   - No "already submitted" refusal. Practising the same paper repeatedly IS
 *     revision, and practice_attempts carries no unique constraint to enforce
 *     otherwise.
 *   - No enrolment requirement. A learner mid-transfer or on holiday can still
 *     revise; the enrolment is recorded when there is one and left null when
 *     there is not.
 *
 * [id] is the public ASS#### system id, same as every other assessment route.
 */
const AttemptSchema = z.object({
  answers: z.record(z.string(), z.string()),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const profile = await getCurrentProfile(request);
  if (!profile || profile.role !== 'student') {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const { answers } = AttemptSchema.parse(await request.json());

    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse('Practice paper not found', 404);

    // Checked by id against the same function that builds the learner's list,
    // so the paper they can open and the list they were shown cannot disagree.
    // This also covers a paper reopened mid-attempt: it drops out of
    // e_papers_for_student, and the learner is told so rather than silently
    // having their work recorded against a live assessment.
    if (!(await canPractise(profile.id, assessment.id))) {
      return errorResponse(
        'This practice paper is no longer available to you.',
        403
      );
    }

    // Recorded when known, null when not. Never a reason to refuse the attempt.
    const enrollment = await getCurrentEnrollment(profile.id);

    const { attemptId } = await recordPracticeAttempt({
      assessmentId: assessment.id,
      studentId: profile.id,
      enrollmentId: enrollment?.enrollmentId ?? null,
      answers,
    });

    return successResponse({ data: { attemptId } });
  } catch (error) {
    return handleApiError(error, 'Could not save this practice attempt', 500, 'Invalid answers');
  }
}
