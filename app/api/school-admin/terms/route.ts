import { NextRequest } from "next/server";
import { listTermsForSchool } from "@/lib/entities/terms";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

// Read-only: a school_admin may view their school's terms, but creating,
// editing, or deleting one is super_admin-only, via /api/admin/system/schools/[id]/terms.
export async function GET(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const { searchParams } = new URL(request.url);
    const academicYearId = searchParams.get("academicYearId") ?? undefined;
    const terms = await listTermsForSchool(profile.schoolId, academicYearId);
    return successResponse({ data: terms });
  } catch (error) {
    return handleApiError(error, "Failed to list terms");
  }
}
