import { NextRequest } from "next/server";
import { resetAccountPassword } from "@/lib/entities/accounts";
import { requireSuperAdmin } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

/** Shared across staff/admin/student/parent — role doesn't affect the reset itself. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const result = await resetAccountPassword(id);
    return successResponse({ data: result });
  } catch (error) {
    return handleApiError(error, "Failed to reset password");
  }
}
