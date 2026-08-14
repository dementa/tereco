import { NextRequest } from "next/server";
import { getAssessmentBySystemId, duplicateAssessment } from "@/lib/assessments";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canManageAssessment } from "@/lib/auth/access";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

// [id] is the public ASS#### system id of the assessment being copied.
export async function POST(
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
    if (!actor || !canManageAssessment(actor, assessment)) {
      return errorResponse("You can only work with assessments you created.", 403);
    }

    const copy = await duplicateAssessment(id, actor.id);
    return successResponse({ data: copy, message: `Duplicated as ${copy.systemId}.` });
  } catch (error) {
    return handleApiError(error, "Failed to duplicate the assessment");
  }
}
