import { NextRequest } from 'next/server';
import { getAssessments } from '@/lib/assessments';
import { errorResponse, successResponse } from '@/lib/apiResponse';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const school = searchParams.get('school') || undefined;
  const className = searchParams.get('class') || undefined;

  try {
    const assessments = await getAssessments(school, className);
    return successResponse({ data: assessments });
  } catch (error) {
    console.error('Error in /api/assessments:', error);
    return errorResponse('Failed to fetch assessments', 500);
  }
}
