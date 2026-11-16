import { NextRequest } from "next/server";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";
import { getCompetencyExamForSchool } from "@/lib/entities/competency-exams";
import { competencyExamName } from "@/lib/competency-exam";

/** One competency exam's name, for the scoring screen header. [id] is the ASS#### system id. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ["staff"]);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);
    const { id } = await params;
    const exam = await getCompetencyExamForSchool(id, profile.schoolId);
    if (!exam) return errorResponse("This exam was not found for your school.", 404);
    return successResponse({
      data: { systemId: exam.systemId, skill: competencyExamName(exam.title), instructions: exam.description ?? "" },
    });
  } catch (error) {
    return handleApiError(error, "Could not open this exam");
  }
}
