import { NextRequest } from "next/server";
import { getLessonAnalyticsSummary, type AnalyticsPeriod } from "@/lib/entities/lesson-analytics";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const PERIODS: AnalyticsPeriod[] = ["day", "week", "month"];

/** One school's lesson filing analytics, broken down by class. */
export async function GET(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") ?? "day") as AnalyticsPeriod;
    if (!PERIODS.includes(period)) return errorResponse("Invalid period", 400);

    const summary = await getLessonAnalyticsSummary(
      { schoolId: profile.schoolId },
      period,
      "class",
      searchParams.get("date") ?? undefined
    );
    return successResponse({ data: summary });
  } catch (error) {
    return handleApiError(error, "Failed to load lesson analytics");
  }
}
