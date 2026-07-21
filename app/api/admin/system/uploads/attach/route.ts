import { NextRequest } from "next/server";
import { z } from "zod";
import { buildPublicId, destroyAsset, verifyAsset } from "@/lib/cloudinary";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRole, requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const AttachSchema = z.object({
  kind: z.enum(["profile", "school", "question"]),
  entityId: z.string().uuid(),
  slot: z.number().int().positive().optional(),
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
  // Peek at the kind before choosing the guard: question images are authored
  // by teachers, while profile photos and school logos stay super-admin only.
  const body = await request.json();
  const denied =
    body?.kind === "question"
      ? await requireRole(request, ["admin", "super_admin", "staff"])
      : await requireSuperAdmin(request);
  if (denied) return denied;

  try {
    const { kind, entityId, slot, remove } = AttachSchema.parse(body);
    const supabase = getSupabaseAdmin();
    const publicId = buildPublicId(kind, entityId, slot);

    // Question images are not written to a row here: saving the paper replaces
    // every question, so the URL is carried in that payload instead. This still
    // verifies the asset against Cloudinary rather than trusting the browser.
    if (kind === "question") {
      if (remove) {
        await destroyAsset(publicId);
        return successResponse({ message: "Image removed", data: { url: null, publicId: null } });
      }
      const asset = await verifyAsset(publicId);
      if (!asset) return errorResponse("The upload could not be verified with Cloudinary.", 400);
      return successResponse({ message: "Image ready", data: { url: asset.url, publicId } });
    }

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
