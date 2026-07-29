import { NextRequest } from "next/server";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, successResponse } from "@/lib/apiResponse";
import { getAvailableAttendanceSessions } from "@/lib/attendance";

/**
 * GET /api/attendance/available?classId=&streamId=&date=&period= — the
 * current teacher's own unattached attendance sessions for one exact slot.
 * What the lesson report's attendance step auto-matches or picks from; never
 * returns another teacher's sessions or one already claimed by a report.
 */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["staff", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const params = request.nextUrl.searchParams;
    const classId = params.get("classId");
    const date = params.get("date");
    const periodRaw = params.get("period");
    const streamId = params.get("streamId");

    if (!classId || !date || !periodRaw) {
      return errorResponse("classId, date and session are required.", 400);
    }
    const period = parseInt(periodRaw.replace(/\D+/g, ""), 10);
    if (!Number.isInteger(period) || period < 1 || period > 30) {
      return errorResponse("session must be a number between 1 and 30.", 400);
    }

    const data = await getAvailableAttendanceSessions({
      staffId: profile.id,
      classId,
      streamId: streamId || null,
      date,
      period,
    });
    return successResponse({ data });
  } catch (error) {
    console.error("Error listing available attendance sessions:", error);
    return errorResponse("Failed to list available attendance.", 500);
  }
}
