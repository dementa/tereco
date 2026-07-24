import { NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getMyAssessmentAttempts } from "@/lib/assessments";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * GET /api/assessments/my-results — every assessment the caller has sat,
 * newest first. Always the caller's own attempts (studentId comes from the
 * session, same rule as /api/assessments/[id]/my-result) — this is the list
 * a learner browses so a missed results_released notification never leaves
 * a score undiscovered.
 */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile(request);
  if (!profile) return errorResponse("Unauthorized", 401);
  try {
    const data = await getMyAssessmentAttempts(profile.id);
    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Failed to load your results");
  }
}
