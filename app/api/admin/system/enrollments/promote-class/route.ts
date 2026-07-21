import { NextRequest } from "next/server";
import { z } from "zod";
import { promoteClass } from "@/lib/entities/enrollments";
import { getCurrentProfile, requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const PromoteSchema = z.object({
  fromClassId: z.string().uuid(),
  toClassId: z.string().uuid(),
  toStreamId: z.string().uuid().nullable().optional(),
  effectiveDate: z.string().min(1, "Choose the date this takes effect"),
});

/** Moves everyone currently in one class into another — the end-of-year step. */
export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const input = PromoteSchema.parse(await request.json());
    if (input.fromClassId === input.toClassId) {
      return errorResponse("Choose a different class to promote into.", 400);
    }
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const result = await promoteClass({ ...input, createdBy: profile.id });
    const failed = result.failures.length;
    return successResponse({
      message: `${result.moved} student(s) promoted${failed ? `, ${failed} could not be moved.` : "."}`,
      data: result,
    });
  } catch (error) {
    return handleApiError(error, "Failed to promote the class");
  }
}
