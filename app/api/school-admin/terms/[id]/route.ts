import { NextRequest } from "next/server";
import { z } from "zod";
import { deleteTerm, getTerm, updateTerm } from "@/lib/entities/terms";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse, UserFacingError } from "@/lib/apiResponse";

/** 403s unless `termId` belongs to the caller's own school. */
async function assertOwnsTerm(schoolId: string, termId: string) {
  const term = await getTerm(termId);
  if (!term || term.schoolId !== schoolId) throw new UserFacingError("That term doesn't belong to your school", 403);
}

const UpdateSchema = z.object({
  name: z.string().optional(),
  startsOn: z.string().min(1).optional(),
  endsOn: z.string().min(1).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const { id } = await params;
    await assertOwnsTerm(profile.schoolId, id);

    const validated = UpdateSchema.parse(await request.json());
    await updateTerm(id, validated);
    return successResponse({ message: "Term updated" });
  } catch (error) {
    return handleApiError(error, "Failed to update term");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const { id } = await params;
    await assertOwnsTerm(profile.schoolId, id);

    await deleteTerm(id);
    return successResponse({ message: "Term deleted" });
  } catch (error) {
    return handleApiError(error, "Failed to delete term");
  }
}
