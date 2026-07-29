import { NextRequest } from "next/server";
import { z } from "zod";
import { createAccount, listAccounts } from "@/lib/entities/accounts";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export async function GET(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const accounts = await listAccounts("staff");
    return successResponse({ data: accounts.filter((a) => a.schoolId === profile.schoolId) });
  } catch (error) {
    return handleApiError(error, "Failed to list staff");
  }
}

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("A valid email is required"),
  gender: z.enum(["male", "female"]).optional(),
});

export async function POST(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const validated = CreateSchema.parse(await request.json());
    // schoolId is always the caller's own school — a client-sent value is never trusted.
    const account = await createAccount({
      ...validated,
      role: "staff",
      schoolId: profile.schoolId,
      createdBy: profile.id,
    });
    return successResponse({ data: account });
  } catch (error) {
    return handleApiError(error, "Failed to create staff account");
  }
}
