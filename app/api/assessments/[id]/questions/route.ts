import { NextRequest } from 'next/server';
import { getAssessmentById, getQuestions } from '@/lib/assessments';
import { errorResponse, successResponse } from '@/lib/apiResponse';

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
      return errorResponse('Assessment not found', 404);
    }

    // 2. Get questions for this assessment
    const questions = await getQuestions(assessment.id);

    // Optionally, you could shuffle questions here if needed
    // const shuffled = questions.sort(() => Math.random() - 0.5);

    return successResponse({ data: questions });
  } catch (error) {
    console.error('Error fetching questions:', error);
    return errorResponse('Failed to fetch questions', 500);
  }
}
