import { NextRequest } from "next/server";
import { allowResit, getAssessmentBySystemId } from "@/lib/assessments";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canMarkAssessment } from "@/lib/auth/access";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

// [id] is the public ASS#### system id. Gated the same as the results GET —
// any teacher who can mark this assessment can also let one of its learners
// resit it, not just its owner.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
  const denied = await requireRole(request, ["admin", "super_admin", "staff"]);
  if (denied) return denied;
  try {
    const { id, submissionId } = await params;
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse("Assessment not found", 404);

    const actor = await getCurrentProfile(request);
    if (!actor || !canMarkAssessment(actor, assessment)) {
      return errorResponse("You can only work with assessments for your own school.", 403);
    }

    await allowResit(assessment.id, submissionId);
    return successResponse({ message: "Submission cleared — the learner can sit this paper again." });
  } catch (error) {
    console.error("Error clearing submission for resit:", error);
    return handleApiError(error, "Failed to clear this submission");
  }
}
