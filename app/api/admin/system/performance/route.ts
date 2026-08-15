import { NextRequest } from "next/server";
import { getSchoolBenchmark, getSchoolLeaderboard, getSystemAssessmentTrend } from "@/lib/entities/performance";
import { requireRole } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["admin", "super_admin"]);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get("trend") === "1") {
      const trend = await getSystemAssessmentTrend();
      return successResponse({ data: trend });
    }

    const academicYearId = searchParams.get("academicYearId") ?? undefined;
    const termId = searchParams.get("termId") ?? undefined;
    const assessmentId = searchParams.get("assessmentId") ?? undefined;
    const schoolId = searchParams.get("schoolId") ?? undefined;
    const classId = searchParams.get("classId") ?? undefined;
    const streamId = searchParams.get("streamId") ?? undefined;

    // A drill-down into one school's own leaderboard — still names-included,
    // since super-admin is in the "sees names" set, but an explicit action
    // distinct from the default cross-school view below. classId/streamId
    // only make sense scoped to a chosen school, so they're read but ignored
    // on the cross-school benchmark branch below.
    if (schoolId) {
      const entries = await getSchoolLeaderboard({ schoolId, classId, streamId, academicYearId, termId, assessmentId });
      return successResponse({ data: entries });
    }

    const entries = await getSchoolBenchmark({ academicYearId, termId, assessmentId });
    return successResponse({ data: entries });
  } catch (error) {
    return handleApiError(error, "Failed to load school performance");
  }
}
