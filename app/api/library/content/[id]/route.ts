import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canManageLibraryContent } from "@/lib/auth/access";
import { archiveLibraryContent, getLibraryContentById, getLibraryPlaybackInfo, updateLibraryContent } from "@/lib/entities/library-content";
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

    return successResponse({ data: { ...content, ...getLibraryPlaybackInfo(content) } });
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

/**
 * Soft-deletes (archiveLibraryContent) — the creator, or admin/super_admin
 * for any item (the "full CRUD control" the approval queue needs). The
 * Cloudinary asset and DB row both stay intact; the item just disappears
 * from every list.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireRole(request, ["staff", "school_admin", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    const { id } = await params;
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const content = await getLibraryContentById(id);
    if (!content) return errorResponse("That item no longer exists.", 404);
    if (!canManageLibraryContent(profile, content)) return errorResponse("Forbidden", 403);

    await archiveLibraryContent(id);
    return successResponse({ message: "Deleted" });
  } catch (error) {
    return handleApiError(error, "Could not delete this item");
  }
}
