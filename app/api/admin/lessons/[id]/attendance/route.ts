import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getLessonAttendance } from "@/lib/lessons";
import { errorResponse, successResponse } from "@/lib/apiResponse";

// GET /api/admin/lessons/[id]/attendance — the per-learner attendance
// recorded against one lesson report, for the admin review expand panel.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ["admin", "super_admin", "staff"]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const attendance = await getLessonAttendance(id);
    return successResponse({ data: attendance });
  } catch (error) {
    console.error("Error fetching lesson attendance:", error);
    return errorResponse("Failed to fetch attendance", 500);
  }
}
