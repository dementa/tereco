import { NextRequest } from 'next/server';
import { getLessons } from '@/lib/lessons';
import { errorResponse, successResponse } from '@/lib/apiResponse';
import { getCurrentProfile, requireRole } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ['admin', 'super_admin', 'staff']);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse('Unauthorized', 401);

    // A teacher sees the reports they filed; admins see the programme.
    const lessons = await getLessons(
      profile.role === 'staff' ? { staffId: profile.id } : {}
    );
    return successResponse({ data: lessons });
  } catch (error) {
    console.error('Error fetching lessons:', error);
    return errorResponse('Failed to fetch lessons', 500);
  }
}
