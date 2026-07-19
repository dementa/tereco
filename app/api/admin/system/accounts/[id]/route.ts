import { NextRequest } from "next/server";
import { deactivateAccount } from "@/lib/entities/accounts";
import { requireSuperAdmin } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

/** Deactivate (not delete) — is_active = false, keeps history intact. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    await deactivateAccount(id);
    return successResponse({ message: "Account deactivated" });
  } catch (error) {
    return handleApiError(error, "Failed to deactivate account");
  }
}
