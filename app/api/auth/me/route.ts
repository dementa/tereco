import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/auth/session";
import { errorResponse, successResponse } from "@/lib/apiResponse";

/** Rehydrates the current session on page load — replaces the old localStorage read. */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile(request);
  if (!profile) return errorResponse("Unauthorized", 401);

  let schoolName = "";
  if (profile.schoolId) {
    const admin = getSupabaseAdmin();
    const { data: school } = await admin
      .from("schools")
      .select("name")
      .eq("id", profile.schoolId)
      .maybeSingle();
    schoolName = school?.name ?? "";
  }

  return successResponse({
    user: {
      id: profile.id,
      staffId: profile.systemId ?? "",
      role: profile.role,
      name: profile.name,
      email: profile.email,
      school: schoolName,
      schoolId: profile.schoolId,
      className: profile.className,
      mustChangePassword: profile.mustChangePassword,
    },
  });
}
