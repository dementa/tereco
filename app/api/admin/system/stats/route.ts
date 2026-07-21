import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, successResponse } from "@/lib/apiResponse";

/**
 * Counts for the dashboard tiles. Uses head-only count queries so nothing is
 * transferred but the number itself.
 */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["admin", "super_admin", "staff"]);
  if (denied) return denied;

  try {
    const supabase = getSupabaseAdmin();
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    // A teacher's dashboard counts their own work, not the programme's.
    if (profile.role === "staff") {
      const [lessons, assessments] = await Promise.all([
        supabase.from("lesson_reports").select("id", { count: "exact", head: true }).eq("staff_id", profile.id),
        supabase.from("assessments").select("id", { count: "exact", head: true })
          .eq("created_by", profile.id).is("deleted_at", null),
      ]);

      // Papers waiting on this teacher: any unscored response on one of their
      // assessments.
      const { data: mine } = await supabase
        .from("assessments")
        .select("id")
        .eq("created_by", profile.id)
        .is("deleted_at", null);

      let toMark = 0;
      for (const a of mine ?? []) {
        const { count } = await supabase
          .from("responses")
          .select("id, submission:assessment_submissions!inner(assessment_id)", { count: "exact", head: true })
          .is("score", null)
          .eq("submission.assessment_id", a.id);
        toMark += count ?? 0;
      }

      return successResponse({
        data: {
          scope: "staff",
          lessons: lessons.count ?? 0,
          assessments: assessments.count ?? 0,
          toMark,
        },
      });
    }

    const countProfiles = (role: string) =>
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", role)
        .eq("is_active", true);

    const [schools, staff, students, parents] = await Promise.all([
      supabase.from("schools").select("id", { count: "exact", head: true }).eq("is_active", true),
      countProfiles("staff"),
      countProfiles("student"),
      countProfiles("parent"),
    ]);

    const failed = [schools, staff, students, parents].find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    return successResponse({
      data: {
        schools: schools.count ?? 0,
        staff: staff.count ?? 0,
        students: students.count ?? 0,
        parents: parents.count ?? 0,
      },
    });
  } catch (error) {
    console.error("Error loading stats:", error);
    return errorResponse("Failed to load stats", 500);
  }
}
