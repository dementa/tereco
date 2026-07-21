import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getAssessmentBySystemId, getQuestions } from "@/lib/assessments";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canManageAssessment } from "@/lib/auth/access";
import { errorResponse } from "@/lib/apiResponse";
import { QuestionPaperDocument } from "@/lib/pdf/QuestionPaperDocument";

// react-pdf needs real Node APIs; it cannot run on the edge runtime.
export const runtime = "nodejs";

/**
 * Printable question paper.
 *
 * `?schoolId=` renders that school's branding. Without it the paper carries
 * TERECO branding, which is what an assessment spanning several schools needs
 * — the assessor decides which they want.
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
    if (!actor || !canManageAssessment(actor, assessment)) {
      return errorResponse("You can only work with assessments you created.", 403);
    }

    const questions = await getQuestions(assessment.id);
    if (questions.length === 0) {
      return errorResponse("This assessment has no questions yet.", 400);
    }

    const supabase = getSupabaseAdmin();
    const schoolId = request.nextUrl.searchParams.get("schoolId");

    let schoolName: string | null = null;
    let schoolLogoUrl: string | null = null;
    if (schoolId) {
      const { data: school } = await supabase
        .from("schools")
        .select("name, logo_url")
        .eq("id", schoolId)
        .maybeSingle();
      schoolName = school?.name ?? null;
      schoolLogoUrl = school?.logo_url ?? null;
    }

    const { data: year } = await supabase
      .from("academic_years")
      .select("label")
      .eq("is_current", true)
      .maybeSingle();

    const buffer = await renderToBuffer(
      QuestionPaperDocument({
        assessmentTitle: assessment.title,
        assessmentSystemId: assessment.systemId,
        schoolName,
        schoolLogoUrl,
        academicYear: year?.label ?? null,
        timeLimitMinutes: assessment.timeLimit,
        instructions: assessment.instructions,
        questions,
      })
    );

    const suffix = schoolName ? `-${schoolName.replace(/[^a-zA-Z0-9]+/g, "-")}` : "";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${assessment.systemId}${suffix}-paper.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating question paper:", error);
    return errorResponse("Failed to generate the question paper", 500);
  }
}
