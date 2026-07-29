import { NextRequest } from "next/server";
import { z } from "zod";
import { createStream, getClassSchoolId } from "@/lib/entities/classes";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const CreateSchema = z.object({
  name: z.string().min(1, "Stream name is required"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const { classId } = await params;
    const owner = await getClassSchoolId(classId);
    if (owner !== profile.schoolId) return errorResponse("That class doesn't belong to your school", 403);

    const validated = CreateSchema.parse(await request.json());
    const stream = await createStream({ classId, ...validated, createdBy: profile.id });
    return successResponse({ data: stream });
  } catch (error) {
    return handleApiError(error, "Failed to create stream");
  }
}
