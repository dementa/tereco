import { NextRequest } from "next/server";
import { getAssessmentBySystemId } from "@/lib/assessments";
import { getAssessmentAnalyticsSegment, type AnalyticsSegment } from "@/lib/entities/assessment-analytics";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canMarkAssessment } from "@/lib/auth/access";
import { errorResponse, successResponse } from "@/lib/apiResponse";

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

// The people behind one chart segment — same gate as the analytics route
// itself (canMarkAssessment), since this is just a drill-down into data the
// caller can already see the count of.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ["admin", "super_admin", "staff"]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const segment = parseSegment(request.nextUrl.searchParams);
    if (!segment) return errorResponse("Invalid or missing segment.", 400);

    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse("Assessment not found", 404);

    const actor = await getCurrentProfile(request);
    if (!actor || !canMarkAssessment(actor, assessment)) {
      return errorResponse("You can only work with assessments for your own school.", 403);
    }

    const entries = await getAssessmentAnalyticsSegment(assessment, segment);
    return successResponse({ data: entries });
  } catch (error) {
    console.error("Error fetching analytics segment:", error);
    return errorResponse("Failed to fetch segment", 500);
  }
}
