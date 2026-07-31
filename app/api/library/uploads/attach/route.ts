import { NextRequest } from "next/server";
import { z } from "zod";
import { buildPublicId, verifyAsset } from "@/lib/cloudinary";
import { CONTENT_TYPE_LIMITS, createDraftLibraryContent } from "@/lib/entities/library-content";
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
  const denied = await requireRole(request, ["staff", "school_admin", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const body = AttachSchema.parse(await request.json());
    const { resourceType } = CONTENT_TYPE_LIMITS[body.contentType];
    const publicId = buildPublicId("library", body.id);

    const asset = await verifyAsset(publicId, resourceType, "authenticated");
    if (!asset) return errorResponse("The upload could not be verified with Cloudinary.", 400);

    const content = await createDraftLibraryContent(profile, {
      id: body.id,
      title: body.title,
      description: body.description,
      contentType: body.contentType,
      cloudinaryPublicId: publicId,
      cloudinaryResourceType: resourceType,
      fileBytes: asset.bytes,
      fileFormat: asset.format,
      learningArea: body.learningArea,
      targets: body.targets?.map((t) => ({ schoolId: t.schoolId, level: t.level, classId: t.classId, studentId: t.studentId })),
    });

    return successResponse({ message: "Draft created", data: content });
  } catch (error) {
    return handleApiError(error, "Could not save the upload");
  }
}
