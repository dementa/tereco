import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getAssessmentBySystemId, getMarkedScript } from "@/lib/assessments";
import { getCurrentProfile } from "@/lib/auth/session";
import { errorResponse } from "@/lib/apiResponse";
import { MarkedScriptDocument } from "@/lib/pdf/MarkedScriptDocument";

export const runtime = "nodejs";

/** The same script as a PDF — the record a family keeps or shares. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile(request);
  if (!profile) return errorResponse("Unauthorized", 401);

  try {
    const { id } = await params;
    const assessment = await getAssessmentBySystemId(id);
    if (!assessment) return errorResponse("Assessment not found", 404);

    const isStaff = ["staff", "admin", "super_admin"].includes(profile.role);
    const requested = request.nextUrl.searchParams.get("studentId");
    const studentId = isStaff && requested ? requested : profile.id;

    if (!isStaff && requested && requested !== profile.id) {
      return errorResponse("You can only download your own result.", 403);
    }
    if (!isStaff && !assessment.resultsReleasedAt) {
      return errorResponse("Results for this assessment have not been released yet.", 403);
    }

    const script = await getMarkedScript(assessment.id, studentId);
    if (!script) return errorResponse("No submission found for this assessment.", 404);

    const buffer = await renderToBuffer(MarkedScriptDocument({ script }));
    const safeName = script.studentName.replace(/[^a-zA-Z0-9]+/g, "-") || "script";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${assessment.systemId}-${safeName}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating marked script:", error);
    return errorResponse("Failed to generate the result PDF", 500);
  }
}
