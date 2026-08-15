import { NextRequest } from "next/server";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canManageLibraryContent } from "@/lib/auth/access";
import { getLibraryContentById, submitLibraryContent } from "@/lib/entities/library-content";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** draft -> pending_approval. Only the item's own creator (or admin/super_admin) may submit it. */
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

    await submitLibraryContent(id);
    return successResponse({ data: await getLibraryContentById(id) });
  } catch (error) {
    return handleApiError(error, "Could not submit this item for approval");
  }
}
