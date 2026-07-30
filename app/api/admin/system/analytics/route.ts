import { NextRequest } from "next/server";
import { getGenderBreakdown, getPopulationByClass, getRecentActivity } from "@/lib/entities/analytics";
import { requireRole } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

/** System-wide demographics/population/activity for the super-admin dashboard. */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["admin", "super_admin"]);
  if (denied) return denied;
  try {
    const [gender, population, activity] = await Promise.all([
      getGenderBreakdown(),
      getPopulationByClass(),
      getRecentActivity(),
    ]);
    return successResponse({ data: { gender, population, activity } });
  } catch (error) {
    return handleApiError(error, "Failed to load analytics");
  }
}
