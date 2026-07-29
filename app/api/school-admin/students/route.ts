import { NextRequest } from "next/server";
import { z } from "zod";
import { createAccount, listAccounts } from "@/lib/entities/accounts";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse, UserFacingError } from "@/lib/apiResponse";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const accounts = await listAccounts("student");
    return successResponse({ data: accounts.filter((a) => a.schoolId === profile.schoolId) });
  } catch (error) {
    return handleApiError(error, "Failed to list students");
  }
}

const CreateSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  middleName: z.string().optional(),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().trim().email("Enter a valid email").optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
  classId: z.string().uuid("Select a class"),
  streamId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const validated = CreateSchema.parse(await request.json());

    const admin = getSupabaseAdmin();
    const { data: classRow } = await admin
      .from("classes")
      .select("has_streams, school_id")
      .eq("id", validated.classId)
      .maybeSingle();

    if (!classRow || classRow.school_id !== profile.schoolId) {
      throw new UserFacingError("That class doesn't belong to your school.");
    }
    if (classRow.has_streams && !validated.streamId) {
      throw new UserFacingError("This class has streams — select one.");
    }

    const account = await createAccount({
      ...validated,
      role: "student",
      schoolId: profile.schoolId,
      createdBy: profile.id,
    });
    return successResponse({ data: account });
  } catch (error) {
    return handleApiError(error, "Failed to create student account");
  }
}
