import { NextRequest } from "next/server";
import { deleteStream } from "@/lib/entities/classes";
import { requireSuperAdmin } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; classId: string; streamId: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { streamId } = await params;
    await deleteStream(streamId);
    return successResponse({ message: "Stream deleted" });
  } catch (error) {
    return handleApiError(error, "Failed to delete stream");
  }
}
