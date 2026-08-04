import { NextRequest } from "next/server";
import { getLessons } from "@/lib/lessons";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** Lesson reports filed for this school admin's own school. */
export async function GET(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const lessons = await getLessons({ schoolId: profile.schoolId });
    return successResponse({ data: lessons });
  } catch (error) {
    return handleApiError(error, "Failed to fetch lessons");
  }
}
