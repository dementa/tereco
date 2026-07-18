import { NextRequest } from 'next/server';
import { getAssessmentById } from '@/lib/assessment-sheets';
import { errorResponse, successResponse } from '@/lib/apiResponse';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const assessment = await getAssessmentById(id);
    if (!assessment) {
      return errorResponse('Assessment not found', 404);
    }
    return successResponse({ data: assessment });
  } catch (error) {
    console.error('Error fetching assessment:', error);
    return errorResponse('Failed to fetch assessment', 500);
  }
}
