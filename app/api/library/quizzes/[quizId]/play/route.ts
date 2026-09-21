import { NextRequest } from "next/server";
import { toPlayable } from "@/lib/entities/library-quizzes";
import { loadQuiz } from "@/lib/library-quiz-access";
import { handleApiError, successResponse } from "@/lib/apiResponse";

/** The quiz as a learner sees it: questions and options only. Answers are revealed one at a time by /check. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  try {
    const { quizId } = await params;
    const loaded = await loadQuiz(request, quizId, "play");
    if ("response" in loaded) return loaded.response;
    return successResponse({ data: { ...toPlayable(loaded.quiz), contentId: loaded.quiz.contentId, canManage: loaded.canManage } });
  } catch (error) {
    return handleApiError(error, "Could not load the quiz");
  }
}
