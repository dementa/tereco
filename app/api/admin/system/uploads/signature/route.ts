import { NextRequest } from "next/server";
import { z } from "zod";
import { createSignedUpload } from "@/lib/cloudinary";
import { requireSuperAdmin } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

const SignSchema = z.object({
  kind: z.enum(["profile", "school"]),
  entityId: z.string().uuid(),
});

/**
 * Issues a short-lived signature for a direct browser upload.
 *
 * The server chooses the public_id, so the client cannot decide where the file
 * lands — it can only upload to the one location we signed for.
 */
export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { kind, entityId } = SignSchema.parse(await request.json());
    return successResponse({ data: createSignedUpload(kind, entityId) });
  } catch (error) {
    return handleApiError(error, "Could not prepare the upload");
  }
}
