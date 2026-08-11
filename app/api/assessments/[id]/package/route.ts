import { NextRequest } from "next/server";
import {
  getAssessmentBySystemId,
  getAssessmentsForStudent,
  getQuestions,
} from "@/lib/assessments";
import { enrollmentClassLabel, getCurrentEnrollment } from "@/lib/entities/enrollments";
import { startOrResumeSitting } from "@/lib/entities/sittings";
import { getCurrentProfile } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";
import { hashContent, signPackageToken, type PackageClaims } from "@/lib/offline/package-token";
import { PACKAGE_GRANT_TTL_MS, packageKeyId, packageSigningKey } from "@/lib/offline/keys";

/**
 * Everything one learner needs to sit one paper with the internet switched off.
 *
 * This is the only online step in an offline sitting (issue #33): the lab
 * downloads a package while connected, then pulls the cable. So the response
 * has to be complete — anything omitted here simply does not exist for that
 * student for the rest of the assessment.
 *
 * The gates are deliberately the same ones the browser path already uses
 * (`assessments_for_student` for eligibility, the same allow-list for question
 * fields), so preparing offline can never reach a paper the web app would
 * refuse, and can never leak a field the web app strips.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const profile = await getCurrentProfile(request);
  if (!profile || profile.role !== "student") {
    return errorResponse("Unauthorized", 401);
  }

  // Which machine the grant is being issued to. It is bound into the signature
  // so a package copied to another desk fails verification there.
  const deviceId = request.nextUrl.searchParams.get("deviceId")?.trim();
  if (!deviceId) {
    return errorResponse("A deviceId is required to prepare an offline package.", 400);
  }

  try {
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse("Assessment not found", 404);

    // Same gate as the questions and sitting routes. Eligibility is the
    // database's answer, so a learner cannot prepare a paper they were never
    // offered — including one that has not opened yet, which is what stops a
    // package being pulled down the night before.
    const eligible = await getAssessmentsForStudent(profile.id);
    if (!eligible.some((a) => a.id === assessment.id)) {
      return errorResponse(
        "This assessment is not available to you. If you have already sat it, your result is under Results.",
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

    /**
     * Anchor the clock before handing over the paper.
     *
     * The sitting is what makes the countdown survive going offline: the
     * device is told when the paper started rather than deciding for itself,
     * so rebooting mid-assessment resumes the same clock. Idempotent, so
     * re-preparing after a failed download does not restart it.
     */
    const sitting = await startOrResumeSitting({
      assessmentId: assessment.id,
      studentId: profile.id,
      enrollmentId: enrollment.enrollmentId,
      timeLimitMinutes: assessment.timeLimit,
    });

    if (sitting.submitted) {
      return errorResponse("You have already submitted this assessment.", 409);
    }

    const questions = await getQuestions(assessment.id);

    /**
     * The same allow-list as the questions route, and for the same reason:
     * `correctAnswer` and `modelAnswer` must never leave the server for a
     * student. It matters more here — this payload is written to a file on a
     * machine the student controls, so a leak is permanent rather than
     * momentary. `config` carries authoring structure only (sections, grouping,
     * shared stimulus), never marking data.
     */
    const safeQuestions = questions.map((q) => ({
      id: q.id,
      code: q.code,
      position: q.position,
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options,
      imageUrl: q.imageUrl,
      maxScore: q.maxScore,
      config: q.config,
    }));

    const content = {
      student: {
        id: profile.id,
        systemId: profile.systemId ?? null,
        name: profile.name,
        classLabel: enrollmentClassLabel(enrollment) || null,
      },
      assessment: {
        id: assessment.id,
        systemId: assessment.systemId,
        title: assessment.title,
        instructions: assessment.instructions,
        durationSeconds: assessment.timeLimit * 60,
        expectedQuestionCount: safeQuestions.length,
      },
      questions: safeQuestions,
    };

    const startedAt = Date.parse(sitting.startedAt);
    const claims: PackageClaims = {
      kid: packageKeyId(),
      studentId: profile.id,
      assessmentId: assessment.id,
      assessmentSystemId: assessment.systemId,
      startedAt,
      durationSeconds: assessment.timeLimit * 60,
      deviceId,
      // Outlives the sitting on purpose: the same grant is what proves
      // authorisation when the submission is finally synced, which may be days
      // later if the lab stays offline.
      validUntil: Date.now() + PACKAGE_GRANT_TTL_MS,
      contentHash: hashContent(content),
    };

    return successResponse({
      data: {
        ...content,
        token: signPackageToken(claims, packageSigningKey()),
        startedAt,
        expiresAt: claims.validUntil,
      },
    });
  } catch (error) {
    return handleApiError(error, "Could not prepare this assessment for offline use");
  }
}
