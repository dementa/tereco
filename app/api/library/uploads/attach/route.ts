import { NextRequest } from "next/server";
import { z } from "zod";
import { buildPublicId, verifyAsset } from "@/lib/cloudinary";
import { createDraftLibraryContent, resourceTypeForFormat } from "@/lib/entities/library-content";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const TargetSchema = z.object({
  schoolId: z.string().uuid().nullable(),
  level: z.number().int().min(1).max(7).nullable(),
  classId: z.string().uuid().nullable(),
  studentId: z.string().uuid().nullable(),
});

const AttachSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  contentType: z.enum(["video", "document", "notes", "support_file", "audiobook", "past_paper", "presentation"]),
  /** The uploaded file's extension — needed here because raw resources store it as part of the public_id (see below). */
  format: z.string().min(1),
  learningArea: z.string().optional(),
  /** Only honoured for admin/super_admin — everyone else gets the auto-inserted whole-school row instead. */
  targets: z.array(TargetSchema).optional(),
});

/**
 * Records an uploaded Library asset as a new draft. The client does NOT
 * send us a URL — we ask Cloudinary what actually exists at the public_id
 * we signed, same reasoning as the profile/school upload flow this mirrors.
 */
export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["staff", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const body = AttachSchema.parse(await request.json());
    const resourceType = resourceTypeForFormat(body.contentType, body.format);
    const signedPublicId = buildPublicId("library", body.id);

    // Confirmed live (2026-07-31): Cloudinary bakes the extension into the
    // stored public_id for `raw` resources — a `raw` upload signed as
    // "…/<uuid>" comes back stored as "…/<uuid>.pdf". image/video keep the
    // public_id clean. Look up (and persist) whichever one Cloudinary
    // actually used, or the very first verification 404s forever.
    const storedPublicId = resourceType === "raw" ? `${signedPublicId}.${body.format}` : signedPublicId;

    const asset = await verifyAsset(storedPublicId, resourceType);
    if (!asset) return errorResponse("The upload could not be verified with Cloudinary.", 400);

    const content = await createDraftLibraryContent(profile, {
      id: body.id,
      title: body.title,
      description: body.description,
      contentType: body.contentType,
      cloudinaryPublicId: storedPublicId,
      cloudinaryResourceType: resourceType,
      fileBytes: asset.bytes,
      fileFormat: body.format,
      pageCount: resourceType === "image" ? asset.pages ?? undefined : undefined,
      learningArea: body.learningArea,
      targets: body.targets?.map((t) => ({ schoolId: t.schoolId, level: t.level, classId: t.classId, studentId: t.studentId })),
    });

    return successResponse({ message: "Draft created", data: content });
  } catch (error) {
    return handleApiError(error, "Could not save the upload");
  }
}
