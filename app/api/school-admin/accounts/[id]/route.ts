import { NextRequest } from "next/server";
import { z } from "zod";
import { deleteAccount, setAccountActive, updateAccount, getAccountSchoolId } from "@/lib/entities/accounts";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse, UserFacingError } from "@/lib/apiResponse";

async function assertOwnsAccount(schoolId: string, accountId: string) {
  const owner = await getAccountSchoolId(accountId);
  if (owner !== schoolId) throw new UserFacingError("That account doesn't belong to your school", 403);
}

// role, system_id and schoolId are deliberately absent — a school-admin edits
// a person's details, not their identity or which school they belong to.
const UpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  middleName: z.string().nullable().optional(),
  lastName: z.string().min(1).optional(),
  contactEmail: z.string().trim().email("Enter a valid email").or(z.literal("")).nullable().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  phonePrimary: z.string().nullable().optional(),
  phoneSecondary: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const { id } = await params;
    await assertOwnsAccount(profile.schoolId, id);

    const updates = UpdateSchema.parse(await request.json());
    if (Object.keys(updates).length === 1 && updates.isActive !== undefined) {
      await setAccountActive(id, updates.isActive);
      return successResponse({
        message: updates.isActive ? "Account reactivated" : "Account deactivated",
      });
    }

    await updateAccount(id, updates);
    return successResponse({ message: "Account updated" });
  } catch (error) {
    return handleApiError(error, "Failed to update account");
  }
}

/** `?hard=true` removes the account entirely, which only succeeds while it holds no history. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const { id } = await params;
    await assertOwnsAccount(profile.schoolId, id);

    if (request.nextUrl.searchParams.get("hard") === "true") {
      await deleteAccount(id);
      return successResponse({ message: "Account deleted" });
    }
    await setAccountActive(id, false);
    return successResponse({ message: "Account deactivated" });
  } catch (error) {
    return handleApiError(error, "Failed to remove account");
  }
}
