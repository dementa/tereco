import { NextRequest } from "next/server";
import { getMyAssessmentAttempts } from "@/lib/assessments";
import { isLinkedToParent } from "@/lib/entities/parents";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** Every assessment a linked child has sat, newest first — mirrors /api/assessments/my-results. */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["parent"]);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const studentId = request.nextUrl.searchParams.get("studentId");
    if (!studentId) return errorResponse("studentId is required", 400);
    if (!(await isLinkedToParent(profile.id, studentId))) {
      return errorResponse("That student isn't linked to your account.", 403);
    }

    const data = await getMyAssessmentAttempts(studentId);
    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Failed to load results");
  }
}
