import { NextRequest } from "next/server";
import { listTermsForSchool } from "@/lib/entities/terms";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** A staff member's own school's terms, for the performance page's term picker. */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["staff"]);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const terms = await listTermsForSchool(profile.schoolId);
    return successResponse({ data: terms });
  } catch (error) {
    return handleApiError(error, "Failed to list terms");
  }
}
