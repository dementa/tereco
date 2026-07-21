import { NextRequest } from "next/server";
import { z } from "zod";
import {
  deleteAcademicYear,
  setCurrentAcademicYear,
  updateAcademicYear,
} from "@/lib/entities/academic-years";
import { requireSuperAdmin } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

const UpdateSchema = z.object({
  label: z.string().min(1).optional(),
  startsOn: z.string().min(1).optional(),
  endsOn: z.string().min(1).optional(),
  // Sent on its own to switch the current year; it is not a plain column
  // update, so it goes through the atomic database function.
  makeCurrent: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const { makeCurrent, ...updates } = UpdateSchema.parse(await request.json());

    await updateAcademicYear(id, updates);
    if (makeCurrent) await setCurrentAcademicYear(id);

    return successResponse({ message: "Academic year updated" });
  } catch (error) {
    return handleApiError(error, "Failed to update academic year");
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
    await deleteAcademicYear(id);
    return successResponse({ message: "Academic year deleted" });
  } catch (error) {
    return handleApiError(error, "Failed to delete academic year");
  }
}
