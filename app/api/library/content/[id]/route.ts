import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canManageLibraryContent } from "@/lib/auth/access";
import { getLibraryContentById, updateLibraryContent } from "@/lib/entities/library-content";
import { authenticatedDeliveryUrl, authenticatedDownloadUrl } from "@/lib/cloudinary";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const PatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  learningArea: z.string().nullable().optional(),
});

/** Single-item detail, with delivery URLs — the creator's own item, or any item for admin/super_admin (approval queue). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireRole(request, ["staff", "school_admin", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    const { id } = await params;
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const content = await getLibraryContentById(id);
    if (!content) return errorResponse("That item no longer exists.", 404);
    if (!canManageLibraryContent(profile, content) && profile.role !== "super_admin") {
      return errorResponse("Forbidden", 403);
    }

    return successResponse({
      data: {
        ...content,
        streamUrl: authenticatedDeliveryUrl(content.cloudinaryPublicId, content.cloudinaryResourceType, content.fileFormat ?? undefined),
        downloadUrl: content.downloadable
          ? authenticatedDownloadUrl(content.cloudinaryPublicId, content.cloudinaryResourceType, content.fileFormat ?? undefined)
          : null,
      },
    });
  } catch (error) {
    return handleApiError(error, "Could not load this item");
  }
}

/**
 * Edits a draft's own fields, or an approved item's — the latter resets it
 * to pending_approval (see updateLibraryContent), so this route never
 * silently lets an edited item skip re-review.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireRole(request, ["staff", "school_admin", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    const { id } = await params;
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const content = await getLibraryContentById(id);
    if (!content) return errorResponse("That item no longer exists.", 404);
    if (!canManageLibraryContent(profile, content)) return errorResponse("Forbidden", 403);

    const updates = PatchSchema.parse(await request.json());
    await updateLibraryContent(id, updates);

    return successResponse({ data: await getLibraryContentById(id) });
  } catch (error) {
    return handleApiError(error, "Could not update this item");
  }
}
