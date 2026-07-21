import { NextRequest } from "next/server";
import { getAssessmentBySystemId, getMarkedScript } from "@/lib/assessments";
import { getCurrentProfile } from "@/lib/auth/session";
import { getSubmissionFor } from "@/lib/entities/offline-submissions";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * A learner's own marked script.
 *
 * Two rules, both enforced here rather than by hiding a link:
 *  - a student may only ever read their own submission
 *  - nothing is visible until results are released, because a script carries
 *    the correct answers and part-marked scores read as final ones
 *
 * Staff and admins may read any learner's script, which is what the
 * per-child printing on the marking screen uses.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile(request);
  if (!profile) return errorResponse("Unauthorized", 401);

  try {
    const { id } = await params;
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse("Assessment not found", 404);

    const isStaff = ["staff", "admin", "super_admin"].includes(profile.role);
    const requested = request.nextUrl.searchParams.get("studentId");

    // A student's id always comes from their session, never the query string.
    const studentId = isStaff && requested ? requested : profile.id;
    if (!isStaff && requested && requested !== profile.id) {
      return errorResponse("You can only view your own result.", 403);
    }

    if (!isStaff && !assessment.resultsReleasedAt) {
      return errorResponse(
        "Results for this assessment have not been released yet. You will be notified when they are.",
        403
      );
    }

    const script = await getMarkedScript(assessment.id, studentId);
    if (!script) return errorResponse("No submission found for this assessment.", 404);

    // A paper sitting has no typed answers, so the marker (and the learner)
    // need the uploaded pages to make any sense of it.
    const submission = await getSubmissionFor(assessment.id, studentId);

    return successResponse({
      data: { ...script, mode: submission?.mode ?? "online", scans: submission?.scans ?? [] },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load the result");
  }
}
