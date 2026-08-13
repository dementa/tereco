import { NextRequest } from "next/server";
import { getAssessmentBySystemId } from "@/lib/assessments";
import { getAssessmentAnalytics } from "@/lib/entities/assessment-analytics";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canMarkAssessment } from "@/lib/auth/access";
import { errorResponse, successResponse } from "@/lib/apiResponse";

// [id] is the public ASS#### system id. Gated on canMarkAssessment (not the
// narrower canManageAssessment) — a collaborator who can only mark, not edit,
// still needs to see how the paper performed.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ["admin", "super_admin", "staff"]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse("Assessment not found", 404);

    const actor = await getCurrentProfile(request);
    if (!actor || !canMarkAssessment(actor, assessment)) {
      return errorResponse("You can only work with assessments for your own school.", 403);
    }

    const analytics = await getAssessmentAnalytics(assessment);
    return successResponse({ data: analytics });
  } catch (error) {
    console.error("Error fetching assessment analytics:", error);
    return errorResponse("Failed to fetch analytics", 500);
  }
}
