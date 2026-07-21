import { NextRequest } from "next/server";
import { z } from "zod";
import { createSignedUpload } from "@/lib/cloudinary";
import { requireRole, requireSuperAdmin } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

const SignSchema = z.object({
  kind: z.enum(["profile", "school", "question"]),
  entityId: z.string().uuid(),
  /** Question images only: the question's position within the paper. */
  slot: z.number().int().positive().optional(),
});

/**
 * Issues a short-lived signature for a direct browser upload.
 *
 * The server chooses the public_id, so the client cannot decide where the file
 * lands — it can only upload to the one location we signed for.
 */
export async function POST(request: NextRequest) {
  // Peek at the kind before choosing the guard: question images are authored
  // by teachers, while profile photos and school logos stay super-admin only.
  const body = await request.json();
  const denied =
    body?.kind === "question"
      ? await requireRole(request, ["admin", "super_admin", "staff"])
      : await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { kind, entityId, slot } = SignSchema.parse(body);
    return successResponse({ data: createSignedUpload(kind, entityId, slot) });
  } catch (error) {
    return handleApiError(error, "Could not prepare the upload");
  }
}
