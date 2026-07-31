import { NextRequest } from "next/server";
import { getCurrentProfile, requireSuperAdmin } from "@/lib/auth/session";
import { approveLibraryContent, getLibraryContentById } from "@/lib/entities/library-content";
import { notify } from "@/lib/entities/notifications";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** Approval is super_admin only — not admin, not the item's own creator. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    const reviewer = await getCurrentProfile(request);
    if (!reviewer) return errorResponse("Unauthorized", 401);

    const before = await getLibraryContentById(id);
    if (!before) return errorResponse("That item no longer exists.", 404);

    await approveLibraryContent(id, reviewer.id);

    await notify({
      type: "library_content_approved",
      title: "Your Library upload was approved",
      body: `"${before.title}" is now visible in the Library.`,
      audience: { profileId: before.createdBy },
      entityType: "library_content",
      entityId: id,
      link: "/staff/library",
      createdBy: reviewer.id,
    });

    return successResponse({ data: await getLibraryContentById(id) });
  } catch (error) {
    return handleApiError(error, "Could not approve this item");
  }
}
