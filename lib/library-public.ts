import type { LibraryContent, LibraryPlaybackInfo } from "@/lib/entities/library-content";

/**
 * What the public (signed-out) Library hands out for one item.
 *
 * A whitelist rather than `{ ...content }`: the signed-in routes return the
 * whole row, but the public ones are answered for anyone on the internet, so
 * internal fields — the Cloudinary public id, the uploader's profile id,
 * school, status — stay on the server. Everything here is what the shared
 * browse card, detail page and viewers actually render.
 */
export interface PublicLibraryItem extends LibraryPlaybackInfo {
  id: string;
  title: string;
  description: string;
  contentType: LibraryContent["contentType"];
  fileFormat: string | null;
  downloadable: boolean;
  learningArea: string | null;
  authorName: string;
  createdAt: string;
}

export function toPublicLibraryItem(
  item: LibraryContent & { authorName?: string },
  playback: LibraryPlaybackInfo
): PublicLibraryItem {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    contentType: item.contentType,
    fileFormat: item.fileFormat,
    downloadable: item.downloadable,
    learningArea: item.learningArea,
    authorName: item.authorName ?? "",
    createdAt: item.createdAt,
    ...playback,
  };
}
