import { NextRequest } from "next/server";
import { z } from "zod";
import { createAccount, listAccounts } from "@/lib/entities/accounts";
import { getCurrentProfile, requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const accounts = await listAccounts(["super_admin"]);
    return successResponse({ data: accounts });
  } catch (error) {
    console.error("Error listing super admins:", error);
    return errorResponse("Failed to list super admins", 500);
  }
}

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("A valid email is required"),
  gender: z.enum(["male", "female"]).optional(),
});

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const validated = CreateSchema.parse(body);
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const account = await createAccount({
      ...validated,
      role: "super_admin",
      createdBy: profile.id,
    });
    return successResponse({ data: account });
  } catch (error) {
    return handleApiError(error, "Failed to create super admin");
  }
}
