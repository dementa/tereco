import { NextRequest, NextResponse } from 'next/server';
import { saveResponses, getAssessmentById, getQuestions } from '@/lib/assessments';
import { z } from 'zod';

// ─── Validation ─────────────────────────────────────────────
const SubmitSchema = z.object({
  studentName: z.string().min(1, 'Student name is required'),
  school: z.string().min(1, 'School is required'),
  className: z.string().min(1, 'Class name is required'),
  assessmentId: z.string().min(1, 'Assessment ID is required'),
  answers: z.record(z.string(), z.string()), // key: string, value: string
  timeSpent: z.number().optional(),
});

// ─── POST ──────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const {id} = await params;

  const assessmentId = id;

  try {
    const body = await request.json();
    const validated = SubmitSchema.parse(body);

    // Ensure the assessment ID matches the route param
    if (validated.assessmentId !== assessmentId) {
      return NextResponse.json(
        { success: false, message: 'Assessment ID mismatch' },
        { status: 400 }
      );
    }

    // 1. Fetch assessment to validate time limit
    const assessment = await getAssessmentById(assessmentId);
    if (!assessment) {
      return NextResponse.json(
        { success: false, message: 'Assessment not found' },
        { status: 404 }
      );
    }

    // 2. Optional: time limit validation
    const timeLimitSeconds = assessment.timeLimit * 60;
    if (validated.timeSpent && validated.timeSpent > timeLimitSeconds + 60) {
      return NextResponse.json(
        { success: false, message: 'Time limit exceeded' },
        { status: 400 }
      );
    }

    // 3. Get questions to auto‑score MCQ
    const questions = await getQuestions(assessment.id);

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
        studentName: validated.studentName,
        school: validated.school,
        class: validated.className,
        assessmentId: validated.assessmentId,
        questionId: q.questionId,
        answer: userAnswer,
        timestamp,
        timeSpent: validated.timeSpent || 0,
        score,
      };
    });

    // 5. Persist responses to Supabase
    await saveResponses(responses);

    return NextResponse.json({ success: true, message: 'Assessment submitted successfully' });
  } catch (error) {
    console.error('Error submitting assessment:', error);

    if (error instanceof z.ZodError) {
      // Use error.issues (not error.errors)
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid submission data',
          errors: error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Submission failed' },
      { status: 500 }
    );
  }
}