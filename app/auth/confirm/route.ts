import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/auth/supabase-server";

/**
 * Where every Supabase auth email (password recovery, invite, magic link)
 * redirects to. Supabase's modern email templates send `token_hash` + `type`;
 * verifying either establishes a real session (sets cookies), which is what
 * lets /auth/change-password work afterwards — it just requires "signed in",
 * not "signed in the normal way".
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const destination = type === "recovery" ? "/auth/change-password" : "/auth";
      return NextResponse.redirect(new URL(destination, origin));
    }
  }

  return NextResponse.redirect(new URL("/auth?error=reset-link-invalid", origin));
}
