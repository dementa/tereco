import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getAllMarkedScripts, getAssessmentBySystemId, isAssessmentVisibleToSchool } from "@/lib/assessments";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError } from "@/lib/apiResponse";
import { MarkedScriptsDocument } from "@/lib/pdf/MarkedScriptDocument";

export const runtime = "nodejs";

/**
 * Every learner's marked script, scoped to this school — only once the
 * assessment is closed. While it's still open, scripts belong to marking,
 * not oversight; "authoring and marking stay with staff" is the boundary
 * this preserves.
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

    if (assessment.status !== "closed") {
      return errorResponse("Scripts are available once this assessment is closed.", 409);
    }

    const scripts = await getAllMarkedScripts(assessment.id, { schoolId: profile.schoolId });
    if (scripts.length === 0) {
      return errorResponse("Nobody from your school has sat this assessment.", 400);
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
        "Content-Disposition": `attachment; filename="${assessment.systemId}-scripts.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to generate the scripts");
  }
}
