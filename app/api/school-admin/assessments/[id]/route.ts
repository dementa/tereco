import { NextRequest } from "next/server";
import { getAssessmentBySystemId, getQuestions, isAssessmentVisibleToSchool } from "@/lib/assessments";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

// [id] is the public ASS#### system id.
//
// Read-only oversight, scoped to the caller's own school — mirrors the list
// route's scoping (getAssessmentsForSchool) via the same shared
// isAssessmentVisibleToSchool predicate, so the two can't drift into
// disagreeing about which assessments a school_admin may see.
//
// Correct answers and model answers are deliberately never read into the
// response here — school_admin gets no `questions` field at all, so there is
// nothing for the client to accidentally leak, not just nothing shown in the
// UI.
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

    // Only the count is exposed — never the questions themselves (no text,
    // no correct/model answers) — so the header can still say "17 questions"
    // without handing a school_admin anything to leak past the UI.
    const questionCount = (await getQuestions(assessment.id)).length;

    return successResponse({
      data: {
        ...assessment,
        questions: [],
        questionCount,
        capabilities: {
          canManage: false,
          canMark: false,
          isOwner: false,
          canDownloadPaper: true,
          canDownloadResults: true,
          // Scripts and the marking guide are only theirs to see once the
          // assessment is closed — "authoring and marking stay with staff"
          // while it's still live.
          canDownloadAnswerKey: assessment.status === "closed",
          canDownloadScripts: assessment.status === "closed",
        },
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load assessment");
  }
}
