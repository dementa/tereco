import { NextRequest } from "next/server";
import { z } from "zod";
import { deleteSchool, getSchool, updateSchool } from "@/lib/entities/schools";
import { requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const school = await getSchool(id);
    if (!school) return errorResponse("School not found", 404);
    return successResponse({ data: school });
  } catch (error) {
    return handleApiError(error, "Failed to load school");
  }
}

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  location: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Enter a valid email").or(z.literal("")).optional(),
  joinedOn: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  // The contact is a staff profile, not free text. Null clears it.
  contactProfileId: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const updates = UpdateSchema.parse(await request.json());
    await updateSchool(id, updates);
    return successResponse({ data: await getSchool(id) });
  } catch (error) {
    return handleApiError(error, "Failed to update school");
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
    await deleteSchool(id);
    return successResponse({ message: "School deleted" });
  } catch (error) {
    return handleApiError(error, "Failed to delete school");
  }
}
