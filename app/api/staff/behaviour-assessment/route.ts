import { NextRequest } from "next/server";
import { getOrCreateBehaviorAssessment } from "@/lib/assessments";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * Resolves (creating on first use) the "Behaviour Rating" form's own
 * backing assessment for the caller's school — see
 * getOrCreateBehaviorAssessment. The teacher never picks or sees an
 * assessment; this is what /staff/behaviour calls before handing off to
 * the same scoring screen enter-marks already uses.
 */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["staff"]);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const assessment = await getOrCreateBehaviorAssessment(profile.schoolId, profile.id);
    return successResponse({ data: { systemId: assessment.systemId } });
  } catch (error) {
    return handleApiError(error, "Failed to prepare the behaviour rating form");
  }
}
