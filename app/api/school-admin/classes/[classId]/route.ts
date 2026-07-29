import { NextRequest } from "next/server";
import { z } from "zod";
import { updateClass, deleteClass, getClassSchoolId } from "@/lib/entities/classes";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse, UserFacingError } from "@/lib/apiResponse";

/** 403s unless `classId` belongs to the caller's own school. */
async function assertOwnsClass(schoolId: string, classId: string) {
  const owner = await getClassSchoolId(classId);
  if (owner !== schoolId) throw new UserFacingError("That class doesn't belong to your school", 403);
}

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  hasStreams: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const { classId } = await params;
    await assertOwnsClass(profile.schoolId, classId);

    const validated = UpdateSchema.parse(await request.json());
    await updateClass(classId, validated);
    return successResponse({ message: "Class updated" });
  } catch (error) {
    return handleApiError(error, "Failed to update class");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const { classId } = await params;
    await assertOwnsClass(profile.schoolId, classId);

    await deleteClass(classId);
    return successResponse({ message: "Class deleted" });
  } catch (error) {
    return handleApiError(error, "Failed to delete class");
  }
}
