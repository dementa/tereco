import { NextRequest } from "next/server";
import { getSchoolAttendanceSessions } from "@/lib/attendance";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** Read-only, school-wide — data entry stays with staff via lesson reports. */
export async function GET(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const sessions = await getSchoolAttendanceSessions(profile.schoolId);
    return successResponse({ data: sessions });
  } catch (error) {
    return handleApiError(error, "Failed to load attendance");
  }
}
