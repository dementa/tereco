import { NextRequest, NextResponse } from 'next/server';
import { getQuestions, saveQuestions } from '@/lib/assessments';
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
  const { id } = await params;
  try {
    const questions = await getQuestions(id);
    return NextResponse.json({ success: true, data: questions });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Failed to fetch questions' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const validated = SaveQuestionsSchema.parse(body);
    await saveQuestions(id, validated.questions);
    return NextResponse.json({ success: true, message: 'Questions saved' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: error.issues},
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Save failed' },
      { status: 500 }
    );
  }
}