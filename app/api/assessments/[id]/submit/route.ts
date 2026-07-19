import { NextRequest } from 'next/server';
import { saveResponses, getAssessmentById, getQuestions } from '@/lib/assessments';
import { z } from 'zod';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { getCurrentProfile } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase';

// ─── Validation ─────────────────────────────────────────────
// studentName/school/className are no longer accepted from the client —
// identity is resolved server-side from the verified session, closing the
// gap that let anyone submit as anyone (and, combined with the unique
// constraint on responses(assessment_id, student_id), the gap that let the
// same student submit the same assessment repeatedly).
const SubmitSchema = z.object({
  answers: z.record(z.string(), z.string()),
  timeSpent: z.number().optional(),
});

// ─── POST ──────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assessmentId = id;

  const profile = await getCurrentProfile(request);
  if (!profile || profile.role !== 'student') {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await request.json();
    const validated = SubmitSchema.parse(body);

    // 1. Fetch assessment to validate time limit
    const assessment = await getAssessmentById(assessmentId);
    if (!assessment) {
      return errorResponse('Assessment not found', 404);
    }

    // 2. Optional: time limit validation
    const timeLimitSeconds = assessment.timeLimit * 60;
    if (validated.timeSpent && validated.timeSpent > timeLimitSeconds + 60) {
      return errorResponse('Time limit exceeded', 400);
    }

    // 3. Get questions to auto‑score MCQ
    const questions = await getQuestions(assessment.id);

    let schoolName = '';
    if (profile.schoolId) {
      const admin = getSupabaseAdmin();
      const { data: school } = await admin.from('schools').select('name').eq('id', profile.schoolId).maybeSingle();
      schoolName = school?.name ?? '';
    }

    // 4. Build responses array
    const timestamp = new Date().toISOString();
    const norm = (s: string) => s.trim().toLowerCase();
    const AUTO_GRADED = new Set(['mcq', 'fill', 'checkbox']);

    const responses = questions.map(q => {
      const userAnswer = validated.answers[q.questionId] || '';
      const maxScore = q.maxScore ?? 1;

      // Auto-score objective questions; leave text answers (short/long/matching/
      // dragdrop) as null so an admin can mark them manually.
      let score: number | undefined;
      if (AUTO_GRADED.has(q.questionType) && q.correctAnswer) {
        if (q.questionType === 'checkbox') {
          const given = userAnswer.split('|').map(s => norm(s)).filter(Boolean).sort();
          const correct = q.correctAnswer.split('|').map(s => norm(s)).filter(Boolean).sort();
          const match = given.length === correct.length && given.every((v, i) => v === correct[i]);
          score = match ? maxScore : 0;
        } else {
          score = norm(userAnswer) === norm(q.correctAnswer) ? maxScore : 0;
        }
      }

      return {
        studentName: profile.name,
        school: schoolName,
        class: profile.className ?? '',
        assessmentId,
        questionId: q.questionId,
        answer: userAnswer,
        timestamp,
        timeSpent: validated.timeSpent || 0,
        score,
        studentId: profile.id,
        schoolId: profile.schoolId ?? undefined,
      };
    });

    // 5. Persist responses to Supabase
    await saveResponses(responses);

    return successResponse({ message: 'Assessment submitted successfully' });
  } catch (error) {
    if (error instanceof Error && error.message === 'ALREADY_SUBMITTED') {
      return errorResponse('You have already submitted this assessment.', 409);
    }
    console.error('Error submitting assessment:', error);
    return handleApiError(error, 'Submission failed', 500, 'Invalid submission data');
  }
}
