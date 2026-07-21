import { NextRequest } from 'next/server';
import { getAssessmentBySystemId, getQuestions } from '@/lib/assessments';
import { errorResponse, successResponse } from '@/lib/apiResponse';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) {
      return errorResponse('Assessment not found', 404);
    }

    const questions = await getQuestions(assessment.id);

    // Never expose correctAnswer / config to students.
    const safeQuestions = questions.map((q) => ({
      id: q.id,
      code: q.code,
      position: q.position,
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
