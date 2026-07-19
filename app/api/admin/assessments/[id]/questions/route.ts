import { NextRequest } from 'next/server';
import { getQuestions, saveQuestions } from '@/lib/assessments';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { requireRole } from '@/lib/auth/session';
import { z } from 'zod';

// Only auto-markable types for now — matching/dragdrop/short/long need manual
// marking, which isn't confirmed/tested yet. questionId is NOT accepted from
// the client — it's assigned server-side from array order (Q1, Q2, ...) so
// it can never be user-mistyped, duplicated, or raced.
const QuestionSchema = z.object({
  questionText: z.string().min(1),
  questionType: z.enum(['mcq', 'checkbox', 'fill']),
  options: z.array(z.string()).default([]),
  correctAnswer: z.string().optional(),
  maxScore: z.number().min(0).default(1),
  config: z.any().optional(),
});

const SaveQuestionsSchema = z.object({
  questions: z.array(QuestionSchema),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  const { id } = await params;
  try {
    const questions = await getQuestions(id);
    return successResponse({ data: questions });
  } catch (error) {
    console.error('Error fetching questions:', error);
    return errorResponse('Failed to fetch questions', 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  const { id } = await params;
  try {
    const body = await request.json();
    const validated = SaveQuestionsSchema.parse(body);
    const withIds = validated.questions.map((q, i) => ({ ...q, questionId: `Q${i + 1}` }));
    await saveQuestions(id, withIds);
    return successResponse({ message: 'Questions saved' });
  } catch (error) {
    console.error('Error saving questions:', error);
    return handleApiError(error, 'Save failed');
  }
}