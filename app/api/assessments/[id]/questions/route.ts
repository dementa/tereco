import { NextRequest, NextResponse } from 'next/server';
import { getAssessmentById, getQuestions } from '@/lib/assessment-sheets';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const assessmentId = params.id;
  try {
    // 1. Get the assessment metadata
    const assessment = await getAssessmentById(assessmentId);
    if (!assessment) {
      return NextResponse.json(
        { success: false, message: 'Assessment not found' },
        { status: 404 }
      );
    }

    // 2. Get questions from the associated sheet
    const questions = await getQuestions(assessment.questionsSheet);

    // Optionally, you could shuffle questions here if needed
    // const shuffled = questions.sort(() => Math.random() - 0.5);

    return NextResponse.json({ success: true, data: questions });
  } catch (error) {
    console.error('Error fetching questions:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch questions' },
      { status: 500 }
    );
  }
}