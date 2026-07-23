import { NextRequest } from "next/server";
import { getAssessmentBySystemId, getAssessmentResults } from "@/lib/assessments";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canMarkAssessment } from "@/lib/auth/access";
import { errorResponse, successResponse } from "@/lib/apiResponse";

// [id] is the public ASS#### system id.
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

    const results = await getAssessmentResults(assessment.id);
    return successResponse({ data: { assessment, results } });
  } catch (error) {
    console.error("Error fetching results:", error);
    return errorResponse("Failed to fetch results", 500);
  }
}
