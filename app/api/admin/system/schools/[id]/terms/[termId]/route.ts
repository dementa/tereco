import { NextRequest } from "next/server";
import { z } from "zod";
import { deleteTerm, updateTerm } from "@/lib/entities/terms";
import { requireSuperAdmin } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

const UpdateSchema = z.object({
  name: z.string().optional(),
  startsOn: z.string().min(1).optional(),
  endsOn: z.string().min(1).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; termId: string }> }) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { termId } = await params;
    const validated = UpdateSchema.parse(await request.json());
    await updateTerm(termId, validated);
    return successResponse({ message: "Term updated" });
  } catch (error) {
    return handleApiError(error, "Failed to update term");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; termId: string }> }) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { termId } = await params;
    await deleteTerm(termId);
    return successResponse({ message: "Term deleted" });
  } catch (error) {
    return handleApiError(error, "Failed to delete term");
  }
}
