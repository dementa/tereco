import { NextRequest } from "next/server";
import { getPracticalTermScoreForStudent } from "@/lib/entities/practical-observations";
import { isLinkedToParent } from "@/lib/entities/parents";
import { getCurrentProfile } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * One learner's practical standing for the current term, for their own report.
 *
 * Read-only and self-scoped, deliberately separate from the scoring route: that
 * one is staff-only because writing an observation requires having been in the
 * room, while reading your own result is exactly what a learner and their parent
 * are entitled to.
 *
 * Like every other student- and parent-reachable performance endpoint here, this
 * returns nothing about classmates and no rank or position — see the comments on
 * getTopPerformersForStudent in lib/entities/performance.ts. A practical score is
 * self-referential by construction (a rate over that learner's own observations),
 * so there is no comparison to leak, and nothing below introduces one.
 */
export async function GET(request: NextRequest) {
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const requested = request.nextUrl.searchParams.get("studentId");

    let studentId: string;
    if (profile.role === "student") {
      // Ignore any studentId the caller supplied. A student reads their own
      // record and nobody else's, and honouring the parameter would turn this
      // into an enumeration endpoint over every learner in the system.
      studentId = profile.id;
    } else if (profile.role === "parent") {
      if (!requested) return errorResponse("studentId is required", 400);
      const linked = await isLinkedToParent(profile.id, requested);
      if (!linked) return errorResponse("Not linked to this student", 403);
      studentId = requested;
    } else {
      return errorResponse("Forbidden", 403);
    }

    const data = await getPracticalTermScoreForStudent(studentId);
    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Could not load practical skills.");
  }
}
