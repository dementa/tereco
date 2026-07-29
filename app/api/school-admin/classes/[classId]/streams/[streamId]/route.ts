import { NextRequest } from "next/server";
import { deleteStream, getStreamSchoolId } from "@/lib/entities/classes";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ streamId: string }> }
) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const { streamId } = await params;
    const owner = await getStreamSchoolId(streamId);
    if (owner !== profile.schoolId) return errorResponse("That stream doesn't belong to your school", 403);

    await deleteStream(streamId);
    return successResponse({ message: "Stream deleted" });
  } catch (error) {
    return handleApiError(error, "Failed to remove stream");
  }
}
