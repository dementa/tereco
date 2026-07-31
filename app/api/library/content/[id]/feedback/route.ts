import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canViewLibraryFeedback } from "@/lib/auth/access";
import { canProfileViewLibraryContent, getLibraryContentById } from "@/lib/entities/library-content";
import { getLibraryFeedback, submitLibraryFeedback } from "@/lib/entities/library-feedback";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const SubmitSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().optional(),
});

/** Anyone with view access to the content may leave one feedback entry on it. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireRole(request, ["staff", "school_admin", "admin", "super_admin", "student", "parent"]);
  if (denied) return denied;

  try {
    const { id } = await params;
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    if (!(await canProfileViewLibraryContent(profile.id, id))) return errorResponse("Forbidden", 403);

    const { rating, comment } = SubmitSchema.parse(await request.json());
    await submitLibraryFeedback({ contentId: id, submittedBy: profile.id, rating, comment });

    return successResponse({ message: "Feedback submitted" });
  } catch (error) {
    return handleApiError(error, "Could not submit feedback");
  }
}

/** Restricted to the content's creator and admin/super_admin — never other viewers. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireRole(request, ["staff", "school_admin", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    const { id } = await params;
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const content = await getLibraryContentById(id);
    if (!content) return errorResponse("That item no longer exists.", 404);
    if (!canViewLibraryFeedback(profile, content)) return errorResponse("Forbidden", 403);

    return successResponse({ data: await getLibraryFeedback(id) });
  } catch (error) {
    return handleApiError(error, "Could not load feedback");
  }
}
