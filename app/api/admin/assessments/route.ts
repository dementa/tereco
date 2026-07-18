import { NextRequest } from 'next/server';
import {
  getAssessments,
  createAssessment,
  saveQuestions,
  Question,
  QuestionType,
} from '@/lib/assessments';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { z } from 'zod';

// ─── GET all assessments ─────────────────────────────
export async function GET() {
  try {
    const assessments = await getAssessments(); // no filters
    return successResponse({ data: assessments });
  } catch (error) {
    console.error('Error fetching assessments:', error);
    return errorResponse('Failed to fetch assessments', 500);
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
  questionsSheet: z.string().optional(),
  questions: z.array(z.object({
    questionId: z.string().min(1),
    questionText: z.string().min(1),
    questionType: z.enum(['mcq', 'checkbox', 'fill', 'matching', 'dragdrop', 'short', 'long']),
    options: z.array(z.string()).optional(),
    correctAnswer: z.string().optional(),
    maxScore: z.number().min(0).optional(),
  })).optional(),
});

export async function POST(request: NextRequest) {
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
      questionsSheet: validated.questionsSheet ?? '',
    });

    if (validated.questions && validated.questions.length > 0) {
      const questions: Question[] = validated.questions.map((q) => ({
        questionId: q.questionId,
        questionText: q.questionText,
        questionType: q.questionType as QuestionType,
        options: q.options ?? [],
        correctAnswer: q.correctAnswer,
        maxScore: q.maxScore ?? 1,
      }));
      await saveQuestions(validated.id, questions);
    }

    return successResponse({ message: 'Assessment created' });
  } catch (error) {
    console.error('Error creating assessment:', error);
    return handleApiError(error, 'Creation failed');
  }
}
