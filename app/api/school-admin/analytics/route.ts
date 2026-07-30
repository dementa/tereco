import { NextRequest } from "next/server";
import { getGenderBreakdown, getPopulationByClass, getRecentActivity } from "@/lib/entities/analytics";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** School-scoped demographics/population/activity for the school-admin dashboard. */
export async function GET(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const [gender, population, activity] = await Promise.all([
      getGenderBreakdown(profile.schoolId),
      getPopulationByClass(profile.schoolId),
      getRecentActivity(profile.schoolId),
    ]);
    return successResponse({ data: { gender, population, activity } });
  } catch (error) {
    return handleApiError(error, "Failed to load analytics");
  }
}
