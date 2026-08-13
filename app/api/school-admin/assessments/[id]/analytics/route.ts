import { NextRequest } from "next/server";
import { getAssessmentBySystemId, isAssessmentVisibleToSchool } from "@/lib/assessments";
import { getAssessmentAnalytics } from "@/lib/entities/assessment-analytics";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

// [id] is the public ASS#### system id. Scoped to profile.schoolId — every
// count here (sat/missed/marked, question stats, top/bottom performers) is
// narrowed to this school's own students, even on an assessment targeted at
// several schools at once.
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

    const analytics = await getAssessmentAnalytics(assessment, { schoolId: profile.schoolId });
    return successResponse({ data: analytics });
  } catch (error) {
    return handleApiError(error, "Failed to fetch analytics");
  }
}
