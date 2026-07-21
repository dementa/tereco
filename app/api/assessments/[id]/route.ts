import { NextRequest } from 'next/server';
import { getAssessmentBySystemId } from '@/lib/assessments';
import { errorResponse, successResponse } from '@/lib/apiResponse';

// [id] is the public ASS#### system id.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) {
      return errorResponse('Assessment not found', 404);
    }
    return successResponse({ data: assessment });
  } catch (error) {
    console.error('Error fetching assessment:', error);
    return errorResponse('Failed to fetch assessment', 500);
  }
}
