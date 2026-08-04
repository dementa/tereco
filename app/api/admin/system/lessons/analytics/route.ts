import { NextRequest } from "next/server";
import { getLessonAnalyticsSummary, type AnalyticsPeriod } from "@/lib/entities/lesson-analytics";
import { requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const PERIODS: AnalyticsPeriod[] = ["day", "week", "month"];

/** System-wide lesson filing analytics, broken down by school. */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["admin", "super_admin"]);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") ?? "day") as AnalyticsPeriod;
    if (!PERIODS.includes(period)) return errorResponse("Invalid period", 400);

    const summary = await getLessonAnalyticsSummary({}, period, "school", searchParams.get("date") ?? undefined);
    return successResponse({ data: summary });
  } catch (error) {
    return handleApiError(error, "Failed to load lesson analytics");
  }
}
