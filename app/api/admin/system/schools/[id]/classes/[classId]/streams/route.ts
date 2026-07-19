import { NextRequest } from "next/server";
import { z } from "zod";
import { createStream } from "@/lib/entities/classes";
import { getCurrentProfile, requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const CreateSchema = z.object({
  name: z.string().min(1, "Stream name is required"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; classId: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { classId } = await params;
    const validated = CreateSchema.parse(await request.json());
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const stream = await createStream({ classId, ...validated, createdBy: profile.id });
    return successResponse({ data: stream });
  } catch (error) {
    return handleApiError(error, "Failed to create stream");
  }
}
