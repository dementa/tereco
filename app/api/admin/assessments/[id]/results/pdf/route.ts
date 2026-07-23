import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getAssessmentBySystemId, getAssessmentResults } from "@/lib/assessments";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canMarkAssessment } from "@/lib/auth/access";
import { errorResponse } from "@/lib/apiResponse";
import { ResultsDocument } from "@/lib/pdf/ResultsDocument";

// @react-pdf/renderer needs real Node APIs; it cannot run on the edge runtime.
export const runtime = "nodejs";

/**
 * Server-rendered results sheet. Generated here rather than in the browser so
 * every recipient gets a byte-identical document that can be emailed, filed or
 * printed without depending on the viewer's device or fonts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ["admin", "super_admin", "staff"]);
  if (denied) return denied;

  try {
    const { id } = await params;
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse("Assessment not found", 404);

    const actor = await getCurrentProfile(request);
    if (!actor || !canMarkAssessment(actor, assessment)) {
      return errorResponse("You can only work with assessments for your own school.", 403);
    }

    const [results, profile] = await Promise.all([
      getAssessmentResults(assessment.id),
      getCurrentProfile(request),
    ]);

    const buffer = await renderToBuffer(
      ResultsDocument({
        assessmentTitle: assessment.title,
        assessmentSystemId: assessment.systemId,
        results,
        generatedAt: new Date().toISOString(),
        generatedBy: profile?.name ?? "TERECO",
      })
    );

    const filename = `${assessment.systemId}-results.pdf`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // Results change as marking progresses, so never serve a stale copy.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating results PDF:", error);
    return errorResponse("Failed to generate the results PDF", 500);
  }
}
