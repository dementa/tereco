import { NextRequest } from "next/server";
import { getLessons } from "@/lib/lessons";
import { isLinkedToParent } from "@/lib/entities/parents";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";
import { getSupabaseAdmin } from "@/lib/supabase";

/** Topic coverage for a linked child's current class — the child's own enrolment decides the class, not a client-supplied one. */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["parent"]);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const studentId = request.nextUrl.searchParams.get("studentId");
    if (!studentId) return errorResponse("studentId is required", 400);
    if (!(await isLinkedToParent(profile.id, studentId))) {
      return errorResponse("That student isn't linked to your account.", 403);
    }

    const admin = getSupabaseAdmin();
    const { data: enrollment, error } = await admin
      .from("current_enrollments")
      .select("class_id")
      .eq("student_id", studentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!enrollment?.class_id) return successResponse({ data: [] });

    const data = await getLessons({ classId: enrollment.class_id });
    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Failed to load lessons");
  }
}
