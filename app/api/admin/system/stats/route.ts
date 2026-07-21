import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, successResponse } from "@/lib/apiResponse";

/**
 * Counts for the dashboard tiles. Uses head-only count queries so nothing is
 * transferred but the number itself.
 */
export async function GET(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;

  try {
    const supabase = getSupabaseAdmin();

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
