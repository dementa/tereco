import { NextRequest } from "next/server";
import { getAssessmentBySystemId, isAssessmentVisibleToSchool } from "@/lib/assessments";
import { getAssessmentAnalyticsSegment, type AnalyticsSegment } from "@/lib/entities/assessment-analytics";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

function parseSegment(searchParams: URLSearchParams): AnalyticsSegment | null {
  const type = searchParams.get("type");
  if (type === "missed") return { type: "missed" };
  if (type === "bucket") {
    const bucket = searchParams.get("bucket");
    return bucket ? { type: "bucket", bucket } : null;
  }
  if (type === "question") {
    const questionId = searchParams.get("questionId");
    return questionId ? { type: "question", questionId } : null;
  }
  return null;
}

// Same scoping as the analytics route itself — a drill-down into data the
// caller can already see the count of, never a wider slice than that.
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
    const segment = parseSegment(request.nextUrl.searchParams);
    if (!segment) return errorResponse("Invalid or missing segment.", 400);

    const assessment = await getAssessmentBySystemId(id);
    if (!assessment || !isAssessmentVisibleToSchool(assessment, profile.schoolId)) {
      return errorResponse("Assessment not found", 404);
    }

    const entries = await getAssessmentAnalyticsSegment(assessment, segment, { schoolId: profile.schoolId });
    return successResponse({ data: entries });
  } catch (error) {
    return handleApiError(error, "Failed to fetch segment");
  }
}
