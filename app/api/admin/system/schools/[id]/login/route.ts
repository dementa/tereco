import { NextRequest } from "next/server";
import { createSchoolAdminLogin } from "@/lib/entities/accounts";
import { getCurrentProfile, requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** Generates the one login a school gets — see createSchoolAdminLogin. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const { id } = await params;
    const account = await createSchoolAdminLogin(id, profile.id);
    return successResponse({ data: account });
  } catch (error) {
    return handleApiError(error, "Failed to generate login");
  }
}
