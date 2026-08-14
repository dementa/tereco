import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getAssessmentBySystemId, getAssessmentResults, isAssessmentVisibleToSchool } from "@/lib/assessments";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError } from "@/lib/apiResponse";
import { ResultsDocument } from "@/lib/pdf/ResultsDocument";

// react-pdf needs real Node APIs; it cannot run on the edge runtime.
export const runtime = "nodejs";

/**
 * Results sheet scoped to the caller's own school — `getAssessmentResults`'s
 * `schoolId` option filters at the query level (not a post-hoc trim), so a
 * multi-school assessment's PDF here never lists another school's students.
 */
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

    const results = await getAssessmentResults(assessment.id, { schoolId: profile.schoolId });

    const buffer = await renderToBuffer(
      ResultsDocument({
        assessmentTitle: assessment.title,
        assessmentSystemId: assessment.systemId,
        results,
        generatedAt: new Date().toISOString(),
        generatedBy: profile.name ?? "TERECO",
      })
    );

    const filename = `${assessment.systemId}-results.pdf`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to generate the results PDF");
  }
}
