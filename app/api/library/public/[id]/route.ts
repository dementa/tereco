import { NextRequest } from "next/server";
import {
  getLibraryContentById,
  getLibraryPlaybackInfo,
  isPublicLibraryContent,
} from "@/lib/entities/library-content";
import { listQuizzesForContent } from "@/lib/entities/library-quizzes";
import { toPublicLibraryItem } from "@/lib/library-public";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One public item and its published quizzes, for the signed-out detail page —
 * the public twin of content/[id]/detail. Anything not public (a draft, an
 * archived item, one aimed at a school or class) gets the same 404 as a
 * missing id, so this route never confirms a private item exists.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const notFound = errorResponse("That item no longer exists.", 404);
    if (!UUID.test(id) || !(await isPublicLibraryContent(id))) return notFound;

    const content = await getLibraryContentById(id);
    if (!content) return notFound;

    const quizzes = await listQuizzesForContent(id);
    return successResponse({
      data: {
        ...toPublicLibraryItem(content, getLibraryPlaybackInfo(content)),
        quizzes: quizzes.map((q) => ({ id: q.id, title: q.title, status: q.status, questionCount: q.questionCount })),
        canManage: false,
      },
    });
  } catch (error) {
    return handleApiError(error, "Could not load this item");
  }
}
