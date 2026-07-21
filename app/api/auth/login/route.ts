import { NextRequest } from "next/server";
import { createClient } from "@/lib/auth/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorResponse, successResponse } from "@/lib/apiResponse";
import { fullName } from "@/lib/entities/accounts";
import { enrollmentClassLabel, getCurrentEnrollment } from "@/lib/entities/enrollments";

/**
 * Accepts either a system ID (TA-2026-0001, TSF-..., TST-..., TPR-...) or an
 * email address (the super admin has no system ID) as `identifier`. Resolves
 * to an email, then signs in via Supabase Auth — this sets real, signed
 * session cookies (via the @supabase/ssr server client), not the old
 * localStorage timestamp.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifier = String(body.identifier ?? "").trim();
    const password = String(body.password ?? "");

    if (!identifier || !password) {
      return errorResponse("Missing credentials", 400);
    }

    const admin = getSupabaseAdmin();
    let email = identifier;

    if (!identifier.includes("@")) {
      const { data: bySystemId } = await admin
        .from("profiles")
        .select("email")
        .eq("system_id", identifier)
        .eq("is_active", true)
        .maybeSingle();

      if (!bySystemId) {
        return errorResponse("Invalid credentials", 401);
      }
      email = bySystemId.email;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      return errorResponse("Invalid credentials", 401);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("id, system_id, role, first_name, middle_name, last_name, email, school_id, must_change_password, school:schools!profiles_school_id_fkey(name)")
      .eq("id", data.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!profile) {
      await supabase.auth.signOut();
      return errorResponse("Invalid credentials", 401);
    }

    // A student's school and class come from their open enrollment, never from
    // the profile — those columns do not exist, precisely so that a transfer
    // cannot retroactively rewrite where their past records belong.
    const enrollment =
      profile.role === "student" ? await getCurrentEnrollment(profile.id) : null;

    let schoolName = profile.school?.name ?? "";
    if (enrollment) {
      const { data: school } = await admin
        .from("schools")
        .select("name")
        .eq("id", enrollment.schoolId)
        .maybeSingle();
      schoolName = school?.name ?? "";
    }

    return successResponse({
      user: {
        id: profile.id,
        staffId: profile.system_id ?? "",
        role: profile.role,
        name: fullName(profile),
        email: profile.email,
        school: schoolName,
        schoolId: enrollment?.schoolId ?? profile.school_id,
        className: enrollmentClassLabel(enrollment) || null,
        mustChangePassword: profile.must_change_password,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return errorResponse("Server error", 500);
  }
}
