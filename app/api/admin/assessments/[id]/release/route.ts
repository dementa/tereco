import { NextRequest } from "next/server";
import { getAssessmentBySystemId, isFullyMarked, releaseResults } from "@/lib/assessments";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** Whether the Release button should be enabled, and why not if it shouldn't. */
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
    return successResponse({
      data: {
        fullyMarked: await isFullyMarked(assessment.id),
        releasedAt: assessment.resultsReleasedAt ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to check release status");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ["admin", "super_admin", "staff"]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse("Assessment not found", 404);

    const { notified } = await releaseResults(assessment.id, profile.id);
    return successResponse({
      message: `Results released — ${notified} learner(s) notified.`,
      data: { notified },
    });
  } catch (error) {
    return handleApiError(error, "Failed to release results");
  }
}
