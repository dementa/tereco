import { NextRequest } from "next/server";
import { getClassLeaderboard, getStaffAssessmentTrend } from "@/lib/entities/performance";
import { getMarkableAssessments } from "@/lib/assessments";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["staff"]);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const { searchParams } = new URL(request.url);

    if (searchParams.get("trend") === "1") {
      const trend = await getStaffAssessmentTrend(profile.id);
      return successResponse({ data: trend });
    }

    const classId = searchParams.get("classId");
    if (!classId) return errorResponse("classId is required", 400);
    const assessmentId = searchParams.get("assessmentId") ?? undefined;

    // A staff member is only trusted with the assessments they can mark —
    // everything they authored/collaborate on, plus any admin-authored paper
    // targeting their school or open to every school (mirrors canMarkAssessment
    // in lib/auth/access.ts). An assessmentId outside that set must not leak
    // results, so it's validated here rather than trusted from the query string.
    if (assessmentId) {
      const markable = await getMarkableAssessments(profile.id, profile.schoolId);
      if (!markable.some((a) => a.id === assessmentId)) {
        return errorResponse("You cannot view results for this assessment", 403);
      }
    }

    const entries = await getClassLeaderboard({
      schoolId: profile.schoolId,
      classId,
      streamId: searchParams.get("streamId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      assessmentId,
    });
    return successResponse({ data: entries });
  } catch (error) {
    return handleApiError(error, "Failed to load class performance");
  }
}
