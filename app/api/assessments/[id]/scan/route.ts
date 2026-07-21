import { NextRequest } from "next/server";
import { z } from "zod";
import { getAssessmentBySystemId } from "@/lib/assessments";
import {
  attachScan,
  getSubmissionFor,
  removeScan,
  startScannedSubmission,
} from "@/lib/entities/offline-submissions";
import { getCurrentEnrollment } from "@/lib/entities/enrollments";
import { buildPublicId, createSignedUpload, destroyAsset, verifyAsset } from "@/lib/cloudinary";
import { getCurrentProfile } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * Whether the assessment is currently open. Enforced on every call rather than
 * checked once: an upload that lands after the deadline is late whatever the
 * page was showing when it started.
 */
function windowError(assessment: { status: string; opensAt?: string; closesAt?: string }) {
  if (assessment.status !== "published") return "This assessment is not open.";
  const now = Date.now();
  if (assessment.opensAt && now < Date.parse(assessment.opensAt))
    return "This assessment has not opened yet.";
  if (assessment.closesAt && now > Date.parse(assessment.closesAt))
    return "This assessment has closed, so pages can no longer be uploaded.";
  return null;
}

/** Current state of this learner's paper submission. */
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

    const submission = await getSubmissionFor(assessment.id, profile.id);
    return successResponse({
      data: { submission, closesAt: assessment.closesAt ?? null, title: assessment.title },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load your submission");
  }
}

const PageSchema = z.object({ pageNumber: z.number().int().positive().max(50) });

/**
 * Issues a signed upload for one page, creating the paper sitting on first use.
 * Two steps in one call so a learner cannot end up with a signature for a
 * submission that was never started.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile(request);
  if (!profile || profile.role !== "student") {
    return errorResponse("Only a learner can upload their own paper.", 403);
  }

  try {
    const { id } = await params;
    const { pageNumber } = PageSchema.parse(await request.json());

    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse("Assessment not found", 404);

    const closed = windowError(assessment);
    if (closed) return errorResponse(closed, 409);

    const enrollment = await getCurrentEnrollment(profile.id);
    if (!enrollment) {
      return errorResponse(
        "You are not currently enrolled in a class, so this paper cannot be recorded.",
        409
      );
    }

    const { submissionId } = await startScannedSubmission({
      assessmentId: assessment.id,
      studentId: profile.id,
      enrollmentId: enrollment.enrollmentId,
    });

    return successResponse({
      data: {
        submissionId,
        upload: createSignedUpload("script", submissionId, pageNumber),
      },
    });
  } catch (error) {
    return handleApiError(error, "Could not prepare the upload");
  }
}

const ConfirmSchema = z.object({
  submissionId: z.string().uuid(),
  pageNumber: z.number().int().positive().max(50),
  remove: z.boolean().optional(),
});

/** Confirms a page landed, reading it back from Cloudinary rather than trusting the browser. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile(request);
  if (!profile || profile.role !== "student") {
    return errorResponse("Only a learner can upload their own paper.", 403);
  }

  try {
    const { id } = await params;
    const { submissionId, pageNumber, remove } = ConfirmSchema.parse(await request.json());

    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse("Assessment not found", 404);

    const closed = windowError(assessment);
    if (closed) return errorResponse(closed, 409);

    // The submission id comes from the request, so confirm it is this
    // learner's before writing anything against it.
    const own = await getSubmissionFor(assessment.id, profile.id);
    if (!own || own.submissionId !== submissionId) {
      return errorResponse("That submission is not yours.", 403);
    }

    const publicId = buildPublicId("script", submissionId, pageNumber);

    if (remove) {
      await destroyAsset(publicId);
      await removeScan(submissionId, pageNumber);
      return successResponse({ message: `Page ${pageNumber} removed` });
    }

    const asset = await verifyAsset(publicId);
    if (!asset) return errorResponse("The upload could not be verified.", 400);

    await attachScan({ submissionId, pageNumber, url: asset.url, publicId });
    return successResponse({ message: `Page ${pageNumber} uploaded`, data: { url: asset.url } });
  } catch (error) {
    return handleApiError(error, "Could not save the page");
  }
}
