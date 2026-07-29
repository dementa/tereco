import { NextRequest } from "next/server";
import { getAssessmentBySystemId, getMarkedScript } from "@/lib/assessments";
import { isLinkedToParent } from "@/lib/entities/parents";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { getSubmissionFor } from "@/lib/entities/offline-submissions";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * A linked child's marked script — same two rules as the student-facing
 * route (app/api/assessments/[id]/my-result): only that child's own
 * submission, and nothing before results are released.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse("Assessment not found", 404);

    if (!assessment.resultsReleasedAt) {
      return errorResponse(
        "Results for this assessment have not been released yet. You will be notified when they are.",
        403
      );
    }

    const script = await getMarkedScript(assessment.id, studentId);
    if (!script) return errorResponse("No submission found for this assessment.", 404);

    const submission = await getSubmissionFor(assessment.id, studentId);

    return successResponse({
      data: { ...script, mode: submission?.mode ?? "online", scans: submission?.scans ?? [] },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load the result");
  }
}
