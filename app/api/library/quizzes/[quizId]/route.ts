import { NextRequest } from "next/server";
import { deleteQuiz, getQuiz, saveQuiz } from "@/lib/entities/library-quizzes";
import { loadQuiz } from "@/lib/library-quiz-access";
import { QuizBodySchema } from "@/lib/library-quiz-schema";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

type Ctx = { params: Promise<{ quizId: string }> };

/** The editor's copy: full quiz including the answers. Author-side only — learners use /play. */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const { quizId } = await params;
    const loaded = await loadQuiz(request, quizId, "manage");
    if ("response" in loaded) return loaded.response;
    return successResponse({ data: loaded.quiz });
  } catch (error) {
    return handleApiError(error, "Could not load the quiz");
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const { quizId } = await params;
    const loaded = await loadQuiz(request, quizId, "manage");
    if ("response" in loaded) return loaded.response;

    const body = QuizBodySchema(quizId).parse(await request.json());
    // A published quiz must keep at least one question, or learners open an empty quiz.
    if (loaded.quiz.status === "published" && body.questions.length === 0) {
      return errorResponse("A published quiz needs at least one question. Unpublish it first.", 400);
    }
    await saveQuiz(quizId, body.title, body.questions);
    return successResponse({ data: await getQuiz(quizId) });
  } catch (error) {
    return handleApiError(error, "Could not save the quiz");
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const { quizId } = await params;
    const loaded = await loadQuiz(request, quizId, "manage");
    if ("response" in loaded) return loaded.response;
    await deleteQuiz(quizId);
    return successResponse({ message: "Quiz deleted." });
  } catch (error) {
    return handleApiError(error, "Could not delete the quiz");
  }
}
