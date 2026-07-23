import { NextRequest } from "next/server";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { markLessonReviewed } from "@/lib/lessons";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

// PATCH /api/admin/lessons/[id]/review — marks a filed lesson report as
// looked at. This is what the end-of-day digest checks against, so an admin
// who has already read a report stops being reminded about it.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ["admin", "super_admin"]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const reviewer = await getCurrentProfile(request);
    if (!reviewer) return errorResponse("Unauthorized", 401);

    await markLessonReviewed(id, reviewer.id);
    return successResponse({ message: "Marked reviewed" });
  } catch (error) {
    return handleApiError(error, "Failed to mark reviewed");
  }
}
