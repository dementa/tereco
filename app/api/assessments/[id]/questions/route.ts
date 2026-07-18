import { NextRequest, NextResponse } from 'next/server';
import { getAssessmentById, getQuestions } from '@/lib/assessments';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const assessmentId = id;
  try {
    // 1. Get the assessment metadata
    const assessment = await getAssessmentById(assessmentId);
    if (!assessment) {
      return NextResponse.json(
        { success: false, message: 'Assessment not found' },
        { status: 404 }
      );
    }

    // 2. Get questions for this assessment
    const questions = await getQuestions(assessment.id);

    // Never expose the answer key to students taking the assessment.
    const sanitized = questions.map((q) => ({
      questionId: q.questionId,
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options,
      maxScore: q.maxScore,
      config: q.config,
    }));

    return NextResponse.json({ success: true, data: sanitized });
  } catch (error) {
    console.error('Error fetching questions:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch questions' },
      { status: 500 }
    );
  }
}