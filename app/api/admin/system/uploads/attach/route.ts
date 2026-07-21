import { NextRequest } from "next/server";
import { z } from "zod";
import { buildPublicId, destroyAsset, verifyAsset } from "@/lib/cloudinary";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const AttachSchema = z.object({
  kind: z.enum(["profile", "school"]),
  entityId: z.string().uuid(),
  /** Omit to clear the existing image. */
  remove: z.boolean().optional(),
});

/**
 * Records an uploaded image against its profile or school.
 *
 * The client does NOT send us a URL. It tells us the upload finished, and we
 * ask Cloudinary what actually exists at the public_id we signed — so a forged
 * response cannot point someone's photo at an arbitrary address.
 */
export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;

  try {
    const { kind, entityId, remove } = AttachSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const publicId = buildPublicId(kind, entityId);

    // Written as two explicit branches rather than computed column names: the
    // generated types cannot check a dynamic key, and silently losing that
    // check is exactly the class of bug the typed client exists to catch.
    async function save(url: string | null, id: string | null) {
      const { error } =
        kind === "profile"
          ? await supabase
              .from("profiles")
              .update({ photo_url: url, photo_public_id: id })
              .eq("id", entityId)
          : await supabase
              .from("schools")
              .update({ logo_url: url, logo_public_id: id })
              .eq("id", entityId);
      if (error) throw new Error(error.message);
    }

    if (remove) {
      await destroyAsset(publicId);
      await save(null, null);
      return successResponse({ message: "Image removed", data: { url: null } });
    }

    const asset = await verifyAsset(publicId);
    if (!asset) {
      return errorResponse("The upload could not be verified with Cloudinary.", 400);
    }

    await save(asset.url, publicId);
    return successResponse({ message: "Image saved", data: { url: asset.url } });
  } catch (error) {
    return handleApiError(error, "Could not save the image");
  }
}
