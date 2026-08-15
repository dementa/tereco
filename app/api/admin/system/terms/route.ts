import { NextRequest } from "next/server";
import { listTermsForSchool, listDistinctTerms } from "@/lib/entities/terms";
import { requireRole } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * Options for the admin/super-admin performance page's term picker.
 * With ?schoolId, one school's own terms (for the single-school drill-down
 * leaderboard). Without it, the distinct (year, number) pairs across every
 * school (for the cross-school benchmark, which compares by term NUMBER —
 * see getSchoolBenchmark). Read-only, so admin and super_admin both reach
 * it, unlike the school-management routes under /system/schools/[id]/terms.
 */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["admin", "super_admin"]);
  if (denied) return denied;
  try {
    const schoolId = request.nextUrl.searchParams.get("schoolId");
    if (schoolId) {
      const terms = await listTermsForSchool(schoolId);
      return successResponse({ data: terms });
    }
    const terms = await listDistinctTerms();
    return successResponse({ data: terms });
  } catch (error) {
    return handleApiError(error, "Failed to list terms");
  }
}
