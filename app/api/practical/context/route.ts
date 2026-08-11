import { NextRequest } from "next/server";
import {
  getPracticalForAssessmentSitting,
  getPracticalForLessonReport,
} from "@/lib/entities/practical-observations";
import { getAssessmentBySystemId } from "@/lib/assessments";
import { canMarkAssessment } from "@/lib/auth/access";
import { getCurrentProfile } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * Practical context for something a reviewer or marker is already looking at.
 *
 * Two questions, one route, because they are the same question asked from two
 * places: "what was actually observed about the learners involved in this?"
 *
 *   ?lessonReportId=…                 what the class did in that lab lesson
 *   ?assessmentId=…&studentId=…       how that learner handled the machine
 *                                     while sitting that paper
 *
 * Both return null rather than an empty shape when there is nothing to say — a
 * lesson that was not a lab lesson, a paper sat with no register taken. An empty
 * chart reads as "they did badly"; an absent panel reads as "this does not
 * apply", which is the truth.
 */
export async function GET(request: NextRequest) {
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const lessonReportId = request.nextUrl.searchParams.get("lessonReportId");
    const assessmentId = request.nextUrl.searchParams.get("assessmentId");
    const studentId = request.nextUrl.searchParams.get("studentId");

    if (lessonReportId) {
      // Reviewing lessons is what admins do; a teacher reviewing their own is
      // covered by the class summary they already have.
      if (!["admin", "super_admin", "school_admin"].includes(profile.role)) {
        return errorResponse("Forbidden", 403);
      }
      return successResponse({ data: await getPracticalForLessonReport(lessonReportId) });
    }

    if (assessmentId && studentId) {
      // Marking authority, not merely staff. canMarkAssessment is deliberately
      // broader than ownership — a teacher may mark anything their own school's
      // learners could have sat — and reusing it keeps this in step with who can
      // already see the script itself rather than inventing a second rule.
      const assessment = await getAssessmentBySystemId(assessmentId);
      if (!assessment) return errorResponse("Assessment not found", 404);
      if (!canMarkAssessment(profile, assessment)) return errorResponse("Forbidden", 403);

      return successResponse({
        data: await getPracticalForAssessmentSitting(assessment.id, studentId),
      });
    }

    return errorResponse("Nothing identified to look up.", 400);
  } catch (error) {
    return handleApiError(error, "Could not load practical context.");
  }
}
