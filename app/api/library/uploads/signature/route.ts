import { NextRequest } from "next/server";
import { z } from "zod";
import { createSignedUpload } from "@/lib/cloudinary";
import { CONTENT_TYPE_LIMITS, validateUpload } from "@/lib/entities/library-content";
import { requireRole } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

const SignSchema = z.object({
  id: z.string().uuid(),
  contentType: z.enum(["video", "document", "notes", "support_file", "audiobook", "past_paper", "presentation"]),
  format: z.string().min(1),
  bytes: z.number().int().positive(),
});

/**
 * Issues a short-lived signature for a direct browser upload of Library
 * content, `type=upload` (the default) — `type=authenticated` was tried and
 * confirmed non-functional live: it needs Cloudinary's separate Auth Token
 * account feature, which this app doesn't configure. Access control lives
 * at our own API layer (canViewLibraryContent), not a Cloudinary-side lock.
 */
export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["staff", "school_admin", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    const { id, contentType, format, bytes } = SignSchema.parse(await request.json());
    validateUpload(contentType, format, bytes);

    const { resourceType } = CONTENT_TYPE_LIMITS[contentType];
    const upload = createSignedUpload("library", id, { resourceType });
    return successResponse({ data: upload });
  } catch (error) {
    return handleApiError(error, "Could not prepare the upload");
  }
}
