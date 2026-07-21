import { NextRequest } from "next/server";
import { z } from "zod";
import { linkParentToStudent, unlinkParentFromStudent, getLinkedStudents } from "@/lib/entities/parents";
import { requireSuperAdmin } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

const LinkSchema = z.object({
  studentId: z.string().uuid(),
  relationship: z.enum(["mother", "father", "guardian"]).optional(),
  isPrimary: z.boolean().optional(),
});

// Unlinking only needs to identify the row. Kept separate so the link schema
// can grow without DELETE silently accepting fields it ignores.
const UnlinkSchema = z.object({ studentId: z.string().uuid() });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const students = await getLinkedStudents(id);
    return successResponse({ data: students });
  } catch (error) {
    return handleApiError(error, "Failed to list linked students");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const { studentId, relationship, isPrimary } = LinkSchema.parse(await request.json());
    await linkParentToStudent(id, studentId, { relationship, isPrimary });
    return successResponse({ message: "Linked" });
  } catch (error) {
    return handleApiError(error, "Failed to link student");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const { studentId } = UnlinkSchema.parse(await request.json());
    await unlinkParentFromStudent(id, studentId);
    return successResponse({ message: "Unlinked" });
  } catch (error) {
    return handleApiError(error, "Failed to unlink student");
  }
}
