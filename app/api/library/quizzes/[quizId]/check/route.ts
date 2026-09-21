import { NextRequest } from "next/server";
import { z } from "zod";
import { checkAnswer } from "@/lib/entities/library-quizzes";
import { loadQuiz } from "@/lib/library-quiz-access";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const Body = z.object({ questionId: z.string().uuid(), choice: z.number().int().min(0) });

/**
 * Marks one answer and only then reveals the right one. Nothing is stored:
 * library quizzes are practice, so there is no attempt history to write.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  try {
    const { quizId } = await params;
    const loaded = await loadQuiz(request, quizId, "play");
    if ("response" in loaded) return loaded.response;

    const { questionId, choice } = Body.parse(await request.json());
    const result = checkAnswer(loaded.quiz, questionId, choice);
    if (!result) return errorResponse("That question is not in this quiz.", 404);
    return successResponse({ data: result });
  } catch (error) {
    return handleApiError(error, "Could not check that answer");
  }
}
