import { NextRequest } from "next/server";
import { createClient } from "@/lib/auth/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { successResponse } from "@/lib/apiResponse";

/**
 * Accepts a system ID or email, same as /api/auth/login, and emails a reset
 * link if it resolves to an account. Always responds with the same generic
 * success message regardless of whether the identifier matched anything —
 * otherwise this endpoint would let anyone probe which system IDs exist.
 *
 * redirectTo is built from the request's own origin, not a hardcoded value,
 * so the email link always points at whichever environment issued it. It
 * still has to be on the project's Redirect URLs allow-list in the Supabase
 * dashboard (Authentication -> URL Configuration) or Supabase silently falls
 * back to the project's Site URL instead.
 */
export async function POST(request: NextRequest) {
  const GENERIC_MESSAGE =
    "If an account exists for that ID or email, we've sent a password reset link to it.";

  try {
    const body = await request.json();
    const identifier = String(body.identifier ?? "").trim();
    if (!identifier) return successResponse({ message: GENERIC_MESSAGE });

    const admin = getSupabaseAdmin();
    let email = identifier;

    if (!identifier.includes("@")) {
      const { data: bySystemId } = await admin
        .from("profiles")
        .select("email")
        .eq("system_id", identifier)
        .eq("is_active", true)
        .maybeSingle();
      if (!bySystemId) return successResponse({ message: GENERIC_MESSAGE });
      email = bySystemId.email;
    }

    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${request.nextUrl.origin}/auth/confirm`,
    });

    return successResponse({ message: GENERIC_MESSAGE });
  } catch {
    return successResponse({ message: GENERIC_MESSAGE });
  }
}
