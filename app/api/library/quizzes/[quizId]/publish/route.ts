import { NextRequest } from "next/server";
import { z } from "zod";
import { setQuizPublished } from "@/lib/entities/library-quizzes";
import { loadQuiz } from "@/lib/library-quiz-access";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const Body = z.object({ published: z.boolean() });

/**
 * Publish / unpublish. No super-admin review: the document was already
 * approved, and a quiz is untimed practice. The one rule is that there is
 * something to take.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  try {
    const { quizId } = await params;
    const loaded = await loadQuiz(request, quizId, "manage");
    if ("response" in loaded) return loaded.response;

    const { published } = Body.parse(await request.json());
    if (published && loaded.quiz.questions.length === 0) {
      return errorResponse("Add at least one question before publishing.", 400);
    }
    await setQuizPublished(quizId, published);
    return successResponse({ message: published ? "Quiz published." : "Quiz moved back to draft." });
  } catch (error) {
    return handleApiError(error, "Could not update the quiz");
  }
}
