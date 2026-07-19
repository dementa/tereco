import { NextRequest } from "next/server";
import { z } from "zod";
import { updateClass, deleteClass } from "@/lib/entities/classes";
import { requireSuperAdmin } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  hasStreams: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; classId: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { classId } = await params;
    const validated = UpdateSchema.parse(await request.json());
    await updateClass(classId, validated);
    return successResponse({ message: "Class updated" });
  } catch (error) {
    return handleApiError(error, "Failed to update class");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; classId: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { classId } = await params;
    await deleteClass(classId);
    return successResponse({ message: "Class deleted" });
  } catch (error) {
    return handleApiError(error, "Failed to delete class");
  }
}
