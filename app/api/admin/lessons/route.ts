import { NextRequest } from 'next/server';
import { getLessons } from '@/lib/lessons';
import { errorResponse, successResponse } from '@/lib/apiResponse';
import { requireRole } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  try {
    const lessons = await getLessons();
    return successResponse({ data: lessons });
  } catch (error) {
    console.error('Error fetching lessons:', error);
    return errorResponse('Failed to fetch lessons', 500);
  }
}
