import { getLessons } from '@/lib/lessons';
import { errorResponse, successResponse } from '@/lib/apiResponse';

export async function GET() {
  try {
    const lessons = await getLessons();
    return successResponse({ data: lessons });
  } catch (error) {
    console.error('Error fetching lessons:', error);
    return errorResponse('Failed to fetch lessons', 500);
  }
}
