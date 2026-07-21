import { NextRequest } from "next/server";
import { z } from "zod";
import { getEnrollmentHistory, moveStudent } from "@/lib/entities/enrollments";
import { getCurrentProfile, requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** A student's full placement history. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    return successResponse({ data: await getEnrollmentHistory(id) });
  } catch (error) {
    return handleApiError(error, "Failed to load enrolment history");
  }
}

const MoveSchema = z
  .object({
    move: z.enum(["transfer", "promote", "repeat", "withdraw"]),
    effectiveDate: z.string().min(1, "Choose the date this takes effect"),
    toSchoolId: z.string().uuid().optional(),
    toClassId: z.string().uuid().optional(),
    toStreamId: z.string().uuid().nullable().optional(),
    reason: z.string().optional(),
  })
  .refine((v) => v.move === "withdraw" || !!v.toClassId, {
    message: "Choose the class they are moving into",
    path: ["toClassId"],
  });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const input = MoveSchema.parse(await request.json());
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const result = await moveStudent({ studentId: id, ...input, createdBy: profile.id });
    return successResponse({
      message:
        input.move === "withdraw"
          ? "Student withdrawn."
          : "Student moved — their previous placement is kept as history.",
      data: result,
    });
  } catch (error) {
    return handleApiError(error, "Failed to move the student");
  }
}
