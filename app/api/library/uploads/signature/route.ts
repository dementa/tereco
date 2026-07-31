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
 * content. Every Library asset is signed for `type=authenticated` delivery
 * — even past_paper, which is downloadable but still only ever served
 * through our own gated route (see content/[id]/stream), never a bare
 * public Cloudinary URL.
 */
export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["staff", "school_admin", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    const { id, contentType, format, bytes } = SignSchema.parse(await request.json());
    validateUpload(contentType, format, bytes);

    const { resourceType } = CONTENT_TYPE_LIMITS[contentType];
    const upload = createSignedUpload("library", id, { resourceType, deliveryType: "authenticated" });
    return successResponse({ data: upload });
  } catch (error) {
    return handleApiError(error, "Could not prepare the upload");
  }
}
