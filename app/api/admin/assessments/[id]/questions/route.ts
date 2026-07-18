import { NextRequest } from 'next/server';
import { getQuestions, saveQuestions } from '@/lib/assessments';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { requireAdmin } from '@/lib/adminAuth';
import { z } from 'zod';

const QuestionSchema = z.object({
  questionId: z.string().min(1),
  questionText: z.string().min(1),
  questionType: z.enum(['mcq', 'checkbox', 'fill', 'matching', 'dragdrop', 'short', 'long']),
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
  const denied = requireAdmin(request);
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
  const denied = requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const body = await request.json();
    const validated = SaveQuestionsSchema.parse(body);
    await saveQuestions(id, validated.questions);
    return successResponse({ message: 'Questions saved' });
  } catch (error) {
    console.error('Error saving questions:', error);
    return handleApiError(error, 'Save failed');
  }
}