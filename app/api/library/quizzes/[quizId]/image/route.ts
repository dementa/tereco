import { NextRequest } from "next/server";
import { z } from "zod";
import { createSignedUpload, verifyAsset } from "@/lib/cloudinary";
import { loadQuiz } from "@/lib/library-quiz-access";
import { quizImagePrefix } from "@/lib/library-quiz-schema";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

type Ctx = { params: Promise<{ quizId: string }> };

/**
 * Question images, in two steps that mirror the other uploads in the app:
 *   POST   — signature for a direct browser upload to Cloudinary
 *   PUT    — after the upload, re-read the asset from Cloudinary and return its URL
 *
 * A discarded image is only detached from the question (on the next save); the
 * Cloudinary asset is left, because deleting it eagerly would break the saved
 * quiz if the teacher never saves.
 *
 * Each upload gets its own slot (a timestamp), NOT the question's position:
 * questions are reordered in the editor, and a position-keyed image would
 * silently follow the wrong question.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { quizId } = await params;
    const loaded = await loadQuiz(request, quizId, "manage");
    if ("response" in loaded) return loaded.response;
    const upload = createSignedUpload("quiz", quizId, { slot: Date.now() });
    return successResponse({ data: upload });
  } catch (error) {
    return handleApiError(error, "Could not prepare the upload");
  }
}

const PublicId = z.object({ publicId: z.string().min(1) });

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const { quizId } = await params;
    const loaded = await loadQuiz(request, quizId, "manage");
    if ("response" in loaded) return loaded.response;

    const { publicId } = PublicId.parse(await request.json());
    if (!publicId.startsWith(quizImagePrefix(quizId))) return errorResponse("That image does not belong to this quiz.", 400);

    const asset = await verifyAsset(publicId);
    if (!asset) return errorResponse("The image did not upload. Please try again.", 400);
    return successResponse({ data: { url: asset.url, publicId } });
  } catch (error) {
    return handleApiError(error, "Could not save the image");
  }
}
