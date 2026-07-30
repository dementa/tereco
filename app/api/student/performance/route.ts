import { NextRequest } from "next/server";
import { getTopPerformersForStudent } from "@/lib/entities/performance";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * The only performance endpoint a student can reach. Never calls
 * getClassLeaderboard/getSchoolLeaderboard/getSchoolBenchmark and never
 * returns a rank/position for the caller — see getTopPerformersForStudent.
 */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["student"]);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const result = await getTopPerformersForStudent(profile.id);
    return successResponse({ data: result });
  } catch (error) {
    return handleApiError(error, "Failed to load performance");
  }
}
