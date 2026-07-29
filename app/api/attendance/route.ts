import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";
import { createAttendanceSession, getAttendanceSessions } from "@/lib/attendance";

/**
 * Attendance is now its own form, filed before the lesson it belongs to —
 * see app/api/lesson/route.ts for how a report later attaches one of these
 * sessions instead of taking attendance itself.
 */
const AttendanceSchema = z
  .object({
    schoolId: z.string().uuid("A school must be selected"),
    classId: z.string().uuid("A class must be selected"),
    streamId: z.string().uuid().optional(),

    date: z.string().min(1, "Date is required"),
    // Same transform as LessonSchema.period in app/api/lesson/route.ts: the
    // wizard sends 'Session 3', the column is the number it always was.
    period: z.union([z.string(), z.number()]).transform((v, ctx) => {
      const n = typeof v === "number" ? v : parseInt(String(v).replace(/\D+/g, ""), 10);
      if (!Number.isInteger(n) || n < 1 || n > 30) {
        ctx.addIssue({ code: "custom", message: "Session must be between 1 and 30" });
        return z.NEVER;
      }
      return n;
    }),

    attendance: z
      .array(
        z.object({
          studentId: z.string().uuid(),
          enrollmentId: z.string().uuid(),
          present: z.boolean(),
        })
      )
      .default([]),
  })
  .strip();

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["staff", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid request body.", 400);
    }

    const result = AttendanceSchema.safeParse(body);
    if (!result.success) return handleApiError(result.error);
    const validated = result.data;

    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const session = await createAttendanceSession({
      staffId: profile.id,
      schoolId: validated.schoolId,
      classId: validated.classId,
      streamId: validated.streamId ?? null,
      date: validated.date,
      period: validated.period,
      attendance: validated.attendance,
    });

    return successResponse({ message: "Attendance saved.", data: session });
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err.code === "23514" || err.code === "P0001") {
      return errorResponse(`This attendance record is not consistent: ${err.message}`, 400);
    }
    console.error("Attendance API error:", error);
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["staff", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    // Always the caller's own sessions — an admin-facing view across all
    // teachers is a distinct feature, out of scope here.
    const data = await getAttendanceSessions({ staffId: profile.id });
    return successResponse({ data });
  } catch (error) {
    console.error("Error listing attendance sessions:", error);
    return errorResponse("Failed to list attendance.", 500);
  }
}
