import { NextRequest } from "next/server";
import { z } from "zod";
import {
  deleteAccount,
  setAccountActive,
  updateAccount,
} from "@/lib/entities/accounts";
import { requireSuperAdmin } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

// role and system_id are deliberately absent: the id encodes the role and is
// referenced by enrolments, submissions and audit rows, so changing it would
// leave someone holding an identifier that contradicts what they are.
const UpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  middleName: z.string().nullable().optional(),
  lastName: z.string().min(1).optional(),
  contactEmail: z.string().email("Enter a valid email").or(z.literal("")).nullable().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  phonePrimary: z.string().nullable().optional(),
  schoolId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
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

    // Activation is its own concern, so toggling it never needs the rest of
    // the form to be present and valid.
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

/**
 * `?hard=true` removes the account entirely, which only succeeds while it holds
 * no history. Without it this deactivates, which is what you want for anyone
 * who has actually done anything.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
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
