import { NextRequest } from "next/server";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canManageLibraryContent } from "@/lib/auth/access";
import { getLibraryContentById } from "@/lib/entities/library-content";
import { createQuiz } from "@/lib/entities/library-quizzes";
import { QuizBodySchema } from "@/lib/library-quiz-schema";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** Creates a DRAFT quiz on a document — empty (write it by hand) or pre-filled (imported from the AI JSON). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireRole(request, ["staff", "admin", "super_admin"]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const content = await getLibraryContentById(id);
    if (!content) return errorResponse("That item no longer exists.", 404);
    if (!canManageLibraryContent(profile, content)) return errorResponse("Forbidden", 403);

    // Images are never part of a brand-new quiz (there is no quiz id to key them by yet).
    const body = QuizBodySchema(null).parse(await request.json());
    const quizId = await createQuiz({
      contentId: id,
      title: body.title,
      createdBy: profile.id,
      questions: body.questions.map((q) => ({ ...q, imageUrl: null, imagePublicId: null })),
    });
    return successResponse({ data: { id: quizId } });
  } catch (error) {
    return handleApiError(error, "Could not create the quiz");
  }
}
