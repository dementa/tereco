import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getAssessmentBySystemId, getQuestions, isAssessmentVisibleToSchool } from "@/lib/assessments";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError } from "@/lib/apiResponse";
import { QuestionPaperDocument } from "@/lib/pdf/QuestionPaperDocument";

// react-pdf needs real Node APIs; it cannot run on the edge runtime.
export const runtime = "nodejs";

/**
 * Printable question paper, always branded for the caller's own school.
 *
 * Unlike the admin route, there is no `?schoolId=` override here — an admin
 * legitimately picks which school's branding to print on a multi-school
 * paper, but a school_admin must never be able to request another school's
 * branded copy, so the school is taken from the session, not the query
 * string.
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

    const questions = await getQuestions(assessment.id);
    if (questions.length === 0) {
      return errorResponse("This assessment has no questions yet.", 400);
    }

    const supabase = getSupabaseAdmin();
    const { data: school } = await supabase
      .from("schools")
      .select("name, logo_url")
      .eq("id", profile.schoolId)
      .maybeSingle();

    const { data: year } = await supabase
      .from("academic_years")
      .select("label")
      .eq("is_current", true)
      .maybeSingle();

    const buffer = await renderToBuffer(
      QuestionPaperDocument({
        assessmentTitle: assessment.title,
        assessmentSystemId: assessment.systemId,
        schoolName: school?.name ?? null,
        schoolLogoUrl: school?.logo_url ?? null,
        academicYear: year?.label ?? null,
        timeLimitMinutes: assessment.timeLimit,
        instructions: assessment.instructions,
        questions,
      })
    );

    const suffix = school?.name ? `-${school.name.replace(/[^a-zA-Z0-9]+/g, "-")}` : "";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${assessment.systemId}${suffix}-paper.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to generate the question paper");
  }
}
