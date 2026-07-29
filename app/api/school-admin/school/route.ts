import { NextRequest } from "next/server";
import { getSchool } from "@/lib/entities/schools";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** Read-only — editing a school's profile (logo, contact person) stays a super-admin job. */
export async function GET(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const school = await getSchool(profile.schoolId);
    if (!school) return errorResponse("School not found", 404);
    return successResponse({ data: school });
  } catch (error) {
    return handleApiError(error, "Failed to load school");
  }
}
