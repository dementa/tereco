import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/auth/supabase-server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/auth/env";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const Schema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  currentPassword: z.string().optional(),
});

/**
 * Confirms the password belongs to whoever is typing it, on a throwaway client
 * that persists nothing — signing in on the request-scoped client would
 * overwrite the caller's own session cookies as a side effect.
 */
async function currentPasswordIsValid(email: string, password: string) {
  const probe = createSupabaseClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await probe.auth.signInWithPassword({ email, password });
  return !error;
}

/** Used for both the forced first-login reset and a voluntary later change. */
export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile(request);
  if (!profile) return errorResponse("Unauthorized", 401);

  try {
    const body = await request.json();
    const { newPassword, currentPassword } = Schema.parse(body);

    // The forced first-login reset cannot ask for a current password — the only
    // one the user has is the temporary one they just signed in with, and
    // demanding it back would be theatre. Every other change is voluntary, made
    // from inside a portal on an already-open session, so it must prove the
    // person at the keyboard is the account holder and not someone who found an
    // unattended screen.
    if (!profile.mustChangePassword) {
      if (!currentPassword) {
        return errorResponse("Enter your current password", 400);
      }
      if (!(await currentPasswordIsValid(profile.email, currentPassword))) {
        return errorResponse("Current password is incorrect", 400);
      }
    }

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
