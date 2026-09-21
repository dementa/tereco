import { z } from "zod";
import { MAX_OPTIONS, MIN_OPTIONS } from "@/lib/library-quiz-import";

/** Only Cloudinary-hosted images, under this quiz's own folder — the client cannot point a question at an arbitrary address. */
export function quizImagePrefix(quizId: string): string {
  return `tereco/library-quizzes/${quizId}/`;
}

export function questionSchema(quizId: string | null) {
  return z
    .object({
      id: z.string().uuid().optional(),
      prompt: z.string().trim().min(1, "A question needs some text."),
      options: z
        .array(z.string().trim().min(1, "An option cannot be empty."))
        .min(MIN_OPTIONS, `A question needs at least ${MIN_OPTIONS} options.`)
        .max(MAX_OPTIONS, `A question can have at most ${MAX_OPTIONS} options.`),
      correctIndex: z.number().int().min(0),
      explanation: z.string().trim().nullable().optional(),
      imageUrl: z.string().url().startsWith("https://res.cloudinary.com/").nullable().optional(),
      imagePublicId: z.string().nullable().optional(),
    })
    .refine((q) => q.correctIndex < q.options.length, { message: "Pick which option is correct.", path: ["correctIndex"] })
    .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === q.options.length, {
      message: "Two options are identical.",
      path: ["options"],
    })
    .refine((q) => !q.imagePublicId || !quizId || q.imagePublicId.startsWith(quizImagePrefix(quizId)), {
      message: "That image does not belong to this quiz.",
      path: ["imagePublicId"],
    });
}

export const QuizBodySchema = (quizId: string | null) =>
  z.object({
    title: z.string().trim().min(1, "The quiz needs a title."),
    questions: z.array(questionSchema(quizId)).max(100, "A quiz can have at most 100 questions.").default([]),
  });
