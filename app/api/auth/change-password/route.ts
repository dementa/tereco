import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/auth/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const Schema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

/** Used for both the forced first-login reset and a voluntary later change. */
export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile(request);
  if (!profile) return errorResponse("Unauthorized", 401);

  try {
    const body = await request.json();
    const { newPassword } = Schema.parse(body);

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return errorResponse(error.message, 400);

    const admin = getSupabaseAdmin();
    await admin
      .from("profiles")
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq("id", profile.id);

    return successResponse({ message: "Password updated" });
  } catch (error) {
    return handleApiError(error, "Failed to update password");
  }
}
