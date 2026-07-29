import { NextRequest } from "next/server";
import { getLinkedStudents } from "@/lib/entities/parents";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["parent"]);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const children = await getLinkedStudents(profile.id);
    return successResponse({ data: children });
  } catch (error) {
    return handleApiError(error, "Failed to load your children");
  }
}
