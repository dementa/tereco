import { NextRequest } from "next/server";
import { listClassesForSchool } from "@/lib/entities/classes";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

// Read-only: a school_admin may view their school's classes, but creating,
// editing, or deleting one is super_admin-only, via /api/admin/system/schools/[id]/classes.
export async function GET(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const classes = await listClassesForSchool(profile.schoolId);
    return successResponse({ data: classes });
  } catch (error) {
    return handleApiError(error, "Failed to list classes");
  }
}
