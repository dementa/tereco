import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "./supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export type Role = "super_admin" | "admin" | "staff" | "student" | "parent";

export interface SessionProfile {
  id: string;
  role: Role;
  /** Convenience join of the name parts — profiles has no single `name` column. */
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  systemId: string | null;
  /**
   * Null for super_admin, admin (TERECO-wide) and student (derived from the
   * student's current enrollment, never stored on the profile — a student can
   * change school mid-year). Only meaningful for staff and parents.
   */
  schoolId: string | null;
  mustChangePassword: boolean;
}

interface ProfileRow {
  id: string;
  role: Role;
  first_name: string | null;
  last_name: string | null;
  email: string;
  system_id: string | null;
  school_id: string | null;
  must_change_password: boolean;
}

function rowToProfile(row: ProfileRow): SessionProfile {
  const firstName = row.first_name ?? "";
  const lastName = row.last_name ?? "";
  return {
    id: row.id,
    role: row.role,
    name: [firstName, lastName].filter(Boolean).join(" "),
    firstName,
    lastName,
    email: row.email,
    systemId: row.system_id,
    schoolId: row.school_id,
    mustChangePassword: row.must_change_password,
  };
}

/**
 * Resolves the authenticated caller's profile, or null if unauthenticated.
 *
 * Tries the browser session cookie first (the normal path — set by
 * /api/auth/login via the @supabase/ssr server client). Falls back to a
 * bearer JWT (`Authorization: Bearer <access_token>`), which is how a real
 * per-user Supabase Auth token is verified for scripts/service calls — this
 * replaces the old static ADMIN_API_TOKEN shared secret, not a re-add of it.
 *
 * `supabase.auth.getUser()` (not `getSession()`) revalidates against
 * Supabase rather than trusting a locally-decoded cookie.
 */
export async function getCurrentProfile(
  request: NextRequest
): Promise<SessionProfile | null> {
  const supabase = await createServerSupabaseClient();
  let userId: string | null = null;

  const { data: cookieData } = await supabase.auth.getUser();
  if (cookieData.user) {
    userId = cookieData.user.id;
  } else {
    const header = request.headers.get("authorization");
    const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    if (bearer) {
      const { data: bearerData } = await supabase.auth.getUser(bearer);
      if (bearerData.user) userId = bearerData.user.id;
    }
  }

  if (!userId) return null;

  const admin = getSupabaseAdmin();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, role, first_name, last_name, email, system_id, school_id, must_change_password")
    .eq("id", userId)
    .eq("is_active", true)
    .single();

  if (error || !profile) return null;
  return rowToProfile(profile as ProfileRow);
}

/**
 * Guards an API route to a set of roles. Returns null when authorized,
 * otherwise a NextResponse the caller should return immediately.
 *
 * Usage mirrors the old requireAdmin(request):
 *   const denied = await requireRole(request, ['admin', 'super_admin']);
 *   if (denied) return denied;
 */
export async function requireRole(
  request: NextRequest,
  allowed: Role[]
): Promise<NextResponse | null> {
  const profile = await getCurrentProfile(request);
  if (!profile) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!allowed.includes(profile.role)) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }
  return null;
}

export function requireSuperAdmin(request: NextRequest): Promise<NextResponse | null> {
  return requireRole(request, ["super_admin"]);
}
