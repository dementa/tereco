import { NextRequest } from "next/server";
import { getAssessmentBySystemId, getAssessmentResults, isAssessmentVisibleToSchool } from "@/lib/assessments";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

// [id] is the public ASS#### system id. Scoped to profile.schoolId, same
// shape as the admin route's response ({ assessment, results }) so the
// shared AssessmentAnalytics component needs no role-specific branching.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const { id } = await params;
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment || !isAssessmentVisibleToSchool(assessment, profile.schoolId)) {
      return errorResponse("Assessment not found", 404);
    }

    // Scores stay with the marking side (admin/staff/super_admin) until the
    // owner releases them — a school_admin sees names/classes/marks only
    // after release, same rule as a student's own result.
    if (!assessment.resultsReleasedAt) {
      return errorResponse("Results for this assessment have not been released to your school yet.", 403);
    }

    const results = await getAssessmentResults(assessment.id, { schoolId: profile.schoolId });
    return successResponse({ data: { assessment, results } });
  } catch (error) {
    return handleApiError(error, "Failed to fetch results");
  }
}
