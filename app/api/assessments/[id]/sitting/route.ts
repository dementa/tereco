import { NextRequest } from "next/server";
import { getAssessmentBySystemId, getAssessmentsForStudent } from "@/lib/assessments";
import { startOrResumeSitting } from "@/lib/entities/sittings";
import { getCurrentEnrollment } from "@/lib/entities/enrollments";
import { getCurrentProfile } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * Start (or resume) this learner's sitting and return the server's clock.
 *
 * The client calls this when it opens the paper and again whenever it
 * reconnects. It is what makes the countdown survive a power cut: the browser
 * no longer owns the start time, so clearing storage or rebooting resumes the
 * same clock rather than granting a fresh one.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const profile = await getCurrentProfile(request);
  if (!profile || profile.role !== "student") {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse("Assessment not found", 404);

    // Same gate as the questions route: eligibility is the database's answer,
    // so a learner cannot open a paper they were never offered.
    const eligible = await getAssessmentsForStudent(profile.id);
    if (!eligible.some((a) => a.id === assessment.id)) {
      return errorResponse(
        "This assessment is no longer available to you. If you have already sat it, your result is under Results.",
        403
      );
    }

    const enrollment = await getCurrentEnrollment(profile.id);
    if (!enrollment) {
      return errorResponse(
        "You are not currently enrolled in a class, so this assessment cannot be recorded.",
        409
      );
    }

    const sitting = await startOrResumeSitting({
      assessmentId: assessment.id,
      studentId: profile.id,
      enrollmentId: enrollment.enrollmentId,
      timeLimitMinutes: assessment.timeLimit,
    });

    return successResponse({ data: sitting });
  } catch (error) {
    return handleApiError(error, "Could not start this sitting");
  }
}
