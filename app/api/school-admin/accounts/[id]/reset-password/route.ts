import { NextRequest } from "next/server";
import { resetAccountPassword, getAccountSchoolId } from "@/lib/entities/accounts";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const { id } = await params;
    const owner = await getAccountSchoolId(id);
    if (owner !== profile.schoolId) return errorResponse("That account doesn't belong to your school", 403);

    const result = await resetAccountPassword(id);
    return successResponse({ data: result });
  } catch (error) {
    return handleApiError(error, "Failed to reset password");
  }
}
