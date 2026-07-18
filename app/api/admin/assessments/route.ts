import { NextRequest, NextResponse } from 'next/server';
import {
  getAssessments,
  createAssessment,
  saveQuestions,
  Question,
  QuestionType,
} from '@/lib/assessments';
import { requireAdmin } from '@/lib/adminAuth';
import { z } from 'zod';

// ─── GET all assessments ─────────────────────────────
export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const assessments = await getAssessments(); // no filters
    return NextResponse.json({ success: true, data: assessments });
  } catch (error) {
    console.error('Error fetching assessments:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch assessments' },
      { status: 500 }
    );
  }
}

// ─── POST create a new assessment ─────────────────────
const CreateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  timeLimit: z.number().min(1),
  startTime: z.string().optional(),
  targetType: z.enum(['general', 'class', 'school+class']),
  targetValue: z.string().optional(),
  questionsSheet: z.string().min(1),
  questions: z.array(z.object({
    questionId: z.string().min(1),
    questionText: z.string().min(1),
    questionType: z.enum(['mcq', 'text']),
    options: z.array(z.string()).optional(),
    correctAnswer: z.string().optional(),
  })).optional(),
});

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const validated = CreateSchema.parse(body);

    await createAssessment({
      id: validated.id,
      title: validated.title,
      description: validated.description,
      timeLimit: validated.timeLimit,
      startTime: validated.startTime,
      targetType: validated.targetType,
      targetValue: validated.targetValue,
      questionsSheet: validated.questionsSheet,
    });

    if (validated.questions && validated.questions.length > 0) {
      const questions: Question[] = validated.questions.map((q) => ({
        questionId: q.questionId,
        questionText: q.questionText,
        questionType: (q.questionType === 'mcq' ? 'mcq' : 'short') as QuestionType,
        options: q.options ?? [],
        correctAnswer: q.correctAnswer,
        maxScore: 1,
      }));
      await saveQuestions(validated.id, questions);
    }

    return NextResponse.json({ success: true, message: 'Assessment created' });
  } catch (error) {
    console.error('Error creating assessment:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Creation failed' },
      { status: 500 }
    );
  }
}
