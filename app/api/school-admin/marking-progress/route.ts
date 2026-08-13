import { NextRequest } from "next/server";
import { getSchoolMarkingProgress } from "@/lib/assessments";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** School-wide totals for the assessments list page's marking-progress panel. */
export async function GET(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const progress = await getSchoolMarkingProgress(profile.schoolId);
    return successResponse({ data: progress });
  } catch (error) {
    return handleApiError(error, "Failed to load marking progress");
  }
}
