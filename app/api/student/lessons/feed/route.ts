import { NextRequest } from "next/server";
import { getClassLessonFeed, type AnalyticsPeriod } from "@/lib/entities/lesson-analytics";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const PERIODS: AnalyticsPeriod[] = ["day", "week", "month"];

/** What was taught in the lessons this student attended, and their own attendance. */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["student"]);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") ?? "week") as AnalyticsPeriod;
    if (!PERIODS.includes(period)) return errorResponse("Invalid period", 400);

    const feed = await getClassLessonFeed(profile.id, period, searchParams.get("date") ?? undefined);
    return successResponse({ data: feed });
  } catch (error) {
    return handleApiError(error, "Failed to load lesson feed");
  }
}
