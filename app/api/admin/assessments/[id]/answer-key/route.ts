import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getAssessmentBySystemId, getQuestions } from "@/lib/assessments";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse } from "@/lib/apiResponse";
import { AnswerKeyDocument } from "@/lib/pdf/AnswerKeyDocument";

export const runtime = "nodejs";

/**
 * The marking key.
 *
 * Refused while the assessment is published: a key in circulation during a
 * live paper destroys the assessment, and "staff only" is not protection when
 * learners share screens and phones. Available on drafts (to review before
 * publishing) and once closed (to mark).
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

    if (assessment.status === "published") {
      return errorResponse(
        "The answer key is unavailable while this assessment is open to learners. Close it first.",
        409
      );
    }

    const questions = await getQuestions(assessment.id);
    if (questions.length === 0) {
      return errorResponse("This assessment has no questions yet.", 400);
    }

    const supabase = getSupabaseAdmin();
    const [{ data: year }, profile] = await Promise.all([
      supabase.from("academic_years").select("label").eq("is_current", true).maybeSingle(),
      getCurrentProfile(request),
    ]);

    const buffer = await renderToBuffer(
      AnswerKeyDocument({
        assessmentTitle: assessment.title,
        assessmentSystemId: assessment.systemId,
        academicYear: year?.label ?? null,
        questions,
        generatedFor: profile?.name ?? "TERECO",
      })
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${assessment.systemId}-answer-key.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating answer key:", error);
    return errorResponse("Failed to generate the answer key", 500);
  }
}
