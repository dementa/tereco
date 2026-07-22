import { NextRequest } from "next/server";
import { z } from "zod";
import { createAccount, listAccounts } from "@/lib/entities/accounts";
import { getCurrentProfile, requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";
import { UserFacingError } from "@/lib/apiResponse";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const accounts = await listAccounts("student");
    return successResponse({ data: accounts });
  } catch (error) {
    console.error("Error listing student accounts:", error);
    return errorResponse("Failed to list student accounts", 500);
  }
}

const CreateSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  middleName: z.string().optional(),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().trim().email("Enter a valid email").optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
  schoolId: z.string().uuid("Select a school"),
  classId: z.string().uuid("Select a class"),
  streamId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const validated = CreateSchema.parse(body);
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const admin = getSupabaseAdmin();
    const { data: classRow } = await admin
      .from("classes")
      .select("has_streams")
      .eq("id", validated.classId)
      .maybeSingle();

    if (!classRow) throw new UserFacingError("The selected class no longer exists — refresh and try again.");
    if (classRow.has_streams && !validated.streamId) {
      throw new UserFacingError("This class has streams — select one.");
    }

    const account = await createAccount({ ...validated, role: "student", createdBy: profile.id });
    return successResponse({ data: account });
  } catch (error) {
    return handleApiError(error, "Failed to create student account");
  }
}
