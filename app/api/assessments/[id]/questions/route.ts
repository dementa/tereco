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

    // Never expose correctAnswer / config to students.
    const safeQuestions = questions.map((q) => ({
      questionId: q.questionId,
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options,
      maxScore: q.maxScore,
    }));

    return successResponse({ data: safeQuestions });
  } catch (error) {
    console.error('Error fetching questions:', error);
    return errorResponse('Failed to fetch questions', 500);
  }
}
