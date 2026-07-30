import { NextRequest } from "next/server";
import { getClassLeaderboard, getSchoolAssessmentTrend, getSchoolLeaderboard } from "@/lib/entities/performance";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export async function GET(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const { searchParams } = new URL(request.url);

    if (searchParams.get("trend") === "1") {
      const trend = await getSchoolAssessmentTrend(profile.schoolId);
      return successResponse({ data: trend });
    }

    const scope = searchParams.get("scope") ?? "class";
    const classId = searchParams.get("classId") ?? undefined;
    const academicYearId = searchParams.get("academicYearId") ?? undefined;
    const termId = searchParams.get("termId") ?? undefined;
    const assessmentId = searchParams.get("assessmentId") ?? undefined;

    if (scope === "school") {
      const entries = await getSchoolLeaderboard({
        schoolId: profile.schoolId,
        classId,
        academicYearId,
        termId,
        assessmentId,
      });
      return successResponse({ data: entries });
    }

    if (!classId) return errorResponse("classId is required", 400);
    const entries = await getClassLeaderboard({
      schoolId: profile.schoolId,
      classId,
      streamId: searchParams.get("streamId") ?? undefined,
      academicYearId,
      termId,
      assessmentId,
    });
    return successResponse({ data: entries });
  } catch (error) {
    return handleApiError(error, "Failed to load class performance");
  }
}
