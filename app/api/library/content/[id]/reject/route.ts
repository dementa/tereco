import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentProfile, requireSuperAdmin } from "@/lib/auth/session";
import { getLibraryContentById, rejectLibraryContent } from "@/lib/entities/library-content";
import { notify } from "@/lib/entities/notifications";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const RejectSchema = z.object({ reason: z.string().min(1, "A rejection needs a reason.") });

/** Approval is super_admin only — not admin, not the item's own creator. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    const reviewer = await getCurrentProfile(request);
    if (!reviewer) return errorResponse("Unauthorized", 401);

    const { reason } = RejectSchema.parse(await request.json());

    const before = await getLibraryContentById(id);
    if (!before) return errorResponse("That item no longer exists.", 404);

    await rejectLibraryContent(id, reviewer.id, reason);

    await notify({
      type: "library_content_rejected",
      title: "Your Library upload was not approved",
      body: reason,
      audience: { profileId: before.createdBy },
      entityType: "library_content",
      entityId: id,
      link: "/staff/library",
      createdBy: reviewer.id,
    });

    return successResponse({ data: await getLibraryContentById(id) });
  } catch (error) {
    return handleApiError(error, "Could not reject this item");
  }
}
