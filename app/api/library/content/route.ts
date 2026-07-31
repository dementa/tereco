import { NextRequest } from "next/server";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import {
  getLibraryContentForProfile,
  getMyLibraryContent,
  getPendingLibraryContent,
  type LibraryContentType,
} from "@/lib/entities/library-content";
import { authenticatedDeliveryUrl, authenticatedDownloadUrl } from "@/lib/cloudinary";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const CONTENT_TYPES = ["video", "document", "notes", "support_file", "audiobook", "past_paper", "presentation"];

function withDeliveryUrls<T extends { cloudinaryPublicId: string; cloudinaryResourceType: "image" | "video" | "raw"; fileFormat: string | null; downloadable: boolean }>(
  item: T
) {
  return {
    ...item,
    streamUrl: authenticatedDeliveryUrl(item.cloudinaryPublicId, item.cloudinaryResourceType, item.fileFormat ?? undefined),
    downloadUrl: item.downloadable
      ? authenticatedDownloadUrl(item.cloudinaryPublicId, item.cloudinaryResourceType, item.fileFormat ?? undefined)
      : null,
  };
}

/**
 * Three views behind one route, all re-checked per request (nothing here is
 * a static/cacheable link):
 *   ?scope=mine    — the caller's own uploads, every status (authoring UI)
 *   ?scope=pending — the cross-school approval queue (super_admin only)
 *   (default)      — the browse view: approved items this profile may see,
 *                     via library_content_for_profile (17-library.sql)
 */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["staff", "school_admin", "admin", "super_admin", "student", "parent"]);
  if (denied) return denied;

  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");

    if (scope === "pending") {
      if (profile.role !== "super_admin") return errorResponse("Forbidden", 403);
      const pending = await getPendingLibraryContent();
      return successResponse({ data: pending.map(withDeliveryUrls) });
    }

    if (scope === "mine") {
      return successResponse({ data: await getMyLibraryContent(profile.id) });
    }

    const contentTypeParam = searchParams.get("contentType");
    const contentType =
      contentTypeParam && CONTENT_TYPES.includes(contentTypeParam)
        ? (contentTypeParam as LibraryContentType)
        : undefined;

    const items = await getLibraryContentForProfile(profile.id, {
      contentType,
      learningArea: searchParams.get("learningArea") ?? undefined,
      keyword: searchParams.get("q") ?? undefined,
    });

    return successResponse({ data: items.map(withDeliveryUrls) });
  } catch (error) {
    return handleApiError(error, "Could not load the library");
  }
}
