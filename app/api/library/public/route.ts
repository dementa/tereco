import { getLibraryPlaybackInfo, getPublicLibraryContent } from "@/lib/entities/library-content";
import { toPublicLibraryItem } from "@/lib/library-public";
import { handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * The public Library: approved, unarchived items with no audience targets,
 * for anyone — no session needed. Same rule as getPublicLibraryContent, so an
 * item becomes public or private only by losing or gaining target rows.
 */
export async function GET() {
  try {
    const items = await getPublicLibraryContent();
    return successResponse({
      data: items.map((item) => toPublicLibraryItem(item, getLibraryPlaybackInfo(item))),
    });
  } catch (error) {
    return handleApiError(error, "Could not load the library");
  }
}
