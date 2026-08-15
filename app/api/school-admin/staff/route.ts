import { NextRequest } from "next/server";
import { listAccounts } from "@/lib/entities/accounts";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

// Read-only: a school_admin may view their school's staff, but creating,
// editing, or deleting an account is super_admin-only, via /api/admin/system/staff.
export async function GET(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const accounts = await listAccounts("staff");
    return successResponse({ data: accounts.filter((a) => a.schoolId === profile.schoolId) });
  } catch (error) {
    return handleApiError(error, "Failed to list staff");
  }
}
