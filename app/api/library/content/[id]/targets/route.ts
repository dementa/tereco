import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { canEditLibraryContentTargets } from "@/lib/auth/access";
import { getLibraryContentById, getLibraryContentTargets, replaceLibraryContentTargets } from "@/lib/entities/library-content";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** Current target rows for one item — the audience editor's initial state. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireRole(request, ["staff", "school_admin", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    const { id } = await params;
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const content = await getLibraryContentById(id);
    if (!content) return errorResponse("That item no longer exists.", 404);
    if (!canEditLibraryContentTargets(profile, content)) return errorResponse("Forbidden", 403);

    return successResponse({ data: await getLibraryContentTargets(id) });
  } catch (error) {
    return handleApiError(error, "Could not load the audience for this item");
  }
}

const TargetSchema = z.object({
  schoolId: z.string().uuid().nullable(),
  level: z.number().int().min(1).max(7).nullable(),
  classId: z.string().uuid().nullable(),
  studentId: z.string().uuid().nullable(),
});

const PutSchema = z.object({ targets: z.array(TargetSchema) });

/**
 * Replaces an item's full audience-target set. This is also how "make
 * public" (submit with the whole-school row omitted) and "restrict to
 * school" (re-add it) happen — there is no separate visibility endpoint,
 * per epic #11's data-model decision.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireRole(request, ["staff", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    const { id } = await params;
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const content = await getLibraryContentById(id);
    if (!content) return errorResponse("That item no longer exists.", 404);
    if (!canEditLibraryContentTargets(profile, content)) return errorResponse("Forbidden", 403);

    const { targets } = PutSchema.parse(await request.json());
    await replaceLibraryContentTargets(id, targets);

    return successResponse({ message: "Audience updated" });
  } catch (error) {
    return handleApiError(error, "Could not update the audience for this item");
  }
}
