import { NextRequest } from "next/server";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canManageLibraryContent } from "@/lib/auth/access";
import {
  canProfileViewLibraryContent,
  getLibraryContentById,
  getLibraryPlaybackInfo,
} from "@/lib/entities/library-content";
import { listQuizzesForContent } from "@/lib/entities/library-quizzes";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * Everything the document detail page needs in one call: the item with its
 * delivery URLs, and its quizzes. The sibling `[id]` GET is authoring-only
 * (owner / super admin); this one is for anyone who may *view* the item —
 * the same audience check the browse list uses — so a learner can open a
 * document by id, and cannot open one they were never targeted with.
 *
 * Drafts (of the item or of its quizzes) are only ever shown to whoever may
 * manage the item; everyone else sees approved content and published quizzes.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireRole(request, ["staff", "school_admin", "admin", "super_admin", "student", "parent"]);
  if (denied) return denied;

  try {
    const { id } = await params;
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const content = await getLibraryContentById(id);
    if (!content) return errorResponse("That item no longer exists.", 404);

    const canManage = canManageLibraryContent(profile, content);
    if (!canManage && !(await canProfileViewLibraryContent(profile.id, id))) {
      // Same answer as a missing item: don't confirm it exists to someone who may not see it.
      return errorResponse("That item no longer exists.", 404);
    }

    const quizzes = await listQuizzesForContent(id, { includeDrafts: canManage });
    return successResponse({
      data: { ...content, ...getLibraryPlaybackInfo(content), quizzes, canManage },
    });
  } catch (error) {
    return handleApiError(error, "Could not load this item");
  }
}
