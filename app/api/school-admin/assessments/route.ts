import { NextRequest } from "next/server";
import { getAssessmentsForSchool } from "@/lib/assessments";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** Read-only oversight — no create/edit/mark capability here, that stays staff-only. */
export async function GET(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const assessments = await getAssessmentsForSchool(profile.schoolId);
    return successResponse({ data: assessments });
  } catch (error) {
    return handleApiError(error, "Failed to load assessments");
  }
}
