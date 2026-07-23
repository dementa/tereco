import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getAllMarkedScripts, getAssessmentBySystemId } from "@/lib/assessments";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canMarkAssessment } from "@/lib/auth/access";
import { errorResponse } from "@/lib/apiResponse";
import { MarkedScriptsDocument } from "@/lib/pdf/MarkedScriptDocument";

export const runtime = "nodejs";

/**
 * Every learner's marked script in one file, each starting on a fresh page —
 * so a teacher prints the class once instead of downloading thirty files.
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

    const scripts = await getAllMarkedScripts(assessment.id);
    if (scripts.length === 0) {
      return errorResponse("Nobody has sat this assessment yet.", 400);
    }

    const buffer = await renderToBuffer(
      MarkedScriptsDocument({
        scripts,
        assessmentTitle: assessment.title,
        assessmentSystemId: assessment.systemId,
      })
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${assessment.systemId}-all-scripts.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating class scripts:", error);
    return errorResponse("Failed to generate the scripts", 500);
  }
}
