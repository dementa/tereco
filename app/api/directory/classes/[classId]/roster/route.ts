import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { listClassRoster } from "@/lib/entities/enrollments";
import { errorResponse, successResponse } from "@/lib/apiResponse";

/**
 * Who is currently enrolled in one class (and stream, if given) — the roster
 * a teacher takes attendance against when filing a lesson report.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  const denied = await requireRole(request, ["super_admin", "admin", "staff"]);
  if (denied) return denied;
  try {
    const { classId } = await params;
    const streamId = request.nextUrl.searchParams.get("streamId");
    const roster = await listClassRoster(classId, streamId);
    return successResponse({ data: roster });
  } catch (error) {
    console.error("Error listing class roster:", error);
    return errorResponse("Failed to list class roster", 500);
  }
}
