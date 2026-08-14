import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getAssessmentBySystemId, getQuestions, isAssessmentVisibleToSchool } from "@/lib/assessments";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError } from "@/lib/apiResponse";
import { AnswerKeyDocument } from "@/lib/pdf/AnswerKeyDocument";

export const runtime = "nodejs";

/**
 * The marking guide — only once the assessment is closed. Stricter than the
 * admin/staff route (which also allows a draft, for review before
 * publishing): a school_admin has no authoring role, so "closed" is the
 * only state where this is theirs to see.
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
      return errorResponse("The marking guide is available once this assessment is closed.", 409);
    }

    const questions = await getQuestions(assessment.id);
    if (questions.length === 0) {
      return errorResponse("This assessment has no questions yet.", 400);
    }

    const supabase = getSupabaseAdmin();
    const { data: year } = await supabase
      .from("academic_years")
      .select("label")
      .eq("is_current", true)
      .maybeSingle();

    const buffer = await renderToBuffer(
      AnswerKeyDocument({
        assessmentTitle: assessment.title,
        assessmentSystemId: assessment.systemId,
        academicYear: year?.label ?? null,
        questions,
        generatedFor: profile.name ?? "TERECO",
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
    return handleApiError(error, "Failed to generate the answer key");
  }
}
