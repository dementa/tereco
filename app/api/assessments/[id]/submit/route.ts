import { NextRequest } from 'next/server';
import {
  AUTO_SCORED_TYPES,
  getAssessmentBySystemId,
  getQuestions,
  saveSubmission,
  type SubmissionAnswer,
} from '@/lib/assessments';
import { z } from 'zod';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { getCurrentProfile } from '@/lib/auth/session';
import { getCurrentEnrollment } from '@/lib/entities/enrollments';

// Identity is resolved server-side from the verified session — the client
// sends answers and nothing else. Combined with the unique constraint on
// assessment_submissions(assessment_id, student_id), that closes both the
// "submit as someone else" and the "submit repeatedly" holes.
const SubmitSchema = z.object({
  // Keyed by question id.
  answers: z.record(z.string(), z.string()),
  timeSpent: z.number().min(0).optional(),
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
    const validated = SubmitSchema.parse(await request.json());

    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) {
      return errorResponse('Assessment not found', 404);
    }
    if (assessment.status !== 'published') {
      return errorResponse('This assessment is not open for submission.', 409);
    }

    const now = Date.now();
    if (assessment.opensAt && now < Date.parse(assessment.opensAt)) {
      return errorResponse('This assessment has not opened yet.', 409);
    }
    if (assessment.closesAt && now > Date.parse(assessment.closesAt)) {
      return errorResponse('This assessment has closed.', 409);
    }

    const timeSpent = validated.timeSpent ?? 0;
    if (timeSpent > assessment.timeLimit * 60 + 60) {
      return errorResponse('Time limit exceeded', 400);
    }

    // The answers are recorded against the enrolment the student sat under, so
    // promoting or transferring them later cannot rewrite which class the
    // result belongs to.
    const enrollment = await getCurrentEnrollment(profile.id);
    if (!enrollment) {
      return errorResponse(
        'You are not currently enrolled in a class, so this assessment cannot be recorded.',
        409
      );
    }

    const questions = await getQuestions(assessment.id);

    const norm = (s: string) => s.trim().toLowerCase();
    const answers: SubmissionAnswer[] = questions.map((q) => {
      const given = validated.answers[q.id] ?? '';

      // Objective questions are marked now; everything else is left null for a
      // human. null means "not yet marked" — distinct from 0, "marked wrong".
      let score: number | undefined;
      if (AUTO_SCORED_TYPES.has(q.questionType) && q.correctAnswer) {
        if (q.questionType === 'checkbox') {
          const a = given.split('|').map(norm).filter(Boolean).sort();
          const b = q.correctAnswer.split('|').map(norm).filter(Boolean).sort();
          score = a.length === b.length && a.every((v, i) => v === b[i]) ? q.maxScore : 0;
        } else {
          score = norm(given) === norm(q.correctAnswer) ? q.maxScore : 0;
        }
      }

      return {
        questionId: q.id,
        answer: given,
        score,
        isAutoScored: score !== undefined,
      };
    });

    await saveSubmission({
      assessmentId: assessment.id,
      studentId: profile.id,
      enrollmentId: enrollment.enrollmentId,
      timeSpentSeconds: timeSpent,
      answers,
    });

    return successResponse({ message: 'Assessment submitted successfully' });
  } catch (error) {
    if (error instanceof Error && error.message === 'ALREADY_SUBMITTED') {
      return errorResponse('You have already submitted this assessment.', 409);
    }
    console.error('Error submitting assessment:', error);
    return handleApiError(error, 'Submission failed', 500, 'Invalid submission data');
  }
}
