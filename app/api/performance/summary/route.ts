import { NextRequest } from "next/server";
import { getStudentCurrentTermPerformance } from "@/lib/entities/performance";
import { isLinkedToParent } from "@/lib/entities/parents";
import { getCurrentProfile } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * One learner's own current-term blended performance (written + attendance),
 * for their own report — same shape and access rules as /api/practical/summary,
 * kept as a separate endpoint because it is a separate business rule (a fixed
 * 50/50 blend, not the school-configured practical weight) and must not be
 * merged into that route's already-careful null-safety.
 */
export async function GET(request: NextRequest) {
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const requested = request.nextUrl.searchParams.get("studentId");

    let studentId: string;
    if (profile.role === "student") {
      studentId = profile.id;
    } else if (profile.role === "parent") {
      if (!requested) return errorResponse("studentId is required", 400);
      const linked = await isLinkedToParent(profile.id, requested);
      if (!linked) return errorResponse("Not linked to this student", 403);
      studentId = requested;
    } else {
      return errorResponse("Forbidden", 403);
    }

    const data = await getStudentCurrentTermPerformance(studentId);
    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Could not load performance.");
  }
}
