import { NextRequest } from "next/server";
import { getAssessmentBySystemId, isFullyMarked, releaseResults } from "@/lib/assessments";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { emailResultsForAssessment } from "@/lib/entities/result-delivery";
import { z } from "zod";
import { isAssessmentOwner } from "@/lib/auth/access";
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

    const actor = await getCurrentProfile(request);
    if (!actor || !isAssessmentOwner(actor, assessment)) {
      return errorResponse("Only the creator of this assessment or an admin can release results.", 403);
    }
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

    const actor = await getCurrentProfile(request);
    if (!actor || !isAssessmentOwner(actor, assessment)) {
      return errorResponse("Only the creator of this assessment or an admin can release results.", 403);
    }

    const body = await request.json().catch(() => ({}));
    const { email } = z.object({ email: z.boolean().optional() }).parse(body ?? {});

    const { notified } = await releaseResults(assessment.id, profile.id);

    // Emailing is opt-in and happens after release: a mail provider being down
    // must not stop learners being told their results exist.
    let delivery = null;
    if (email) delivery = await emailResultsForAssessment(assessment.id);

    const suffix = delivery
      ? ` ${delivery.sent} email(s) sent, ${delivery.skipped} learner(s) had no address` +
        (delivery.failures.length ? `, ${delivery.failures.length} failed.` : ".")
      : "";

    return successResponse({
      message: `Results released — ${notified} learner(s) notified.${suffix}`,
      data: { notified, delivery },
    });
  } catch (error) {
    return handleApiError(error, "Failed to release results");
  }
}
