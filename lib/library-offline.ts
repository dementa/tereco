import { createHash } from "node:crypto";
import type { LibraryContentType, LibraryPlaybackInfo } from "@/lib/entities/library-content";
import type { LibraryQuiz } from "@/lib/entities/library-quizzes";

/**
 * The offline library catalog: what TERECO Collect downloads so the Library
 * works with the internet switched off.
 *
 * Only items the desktop can actually open without a network are listed. PDFs
 * (page images), .docx (rendered locally by mammoth), video and audio all play
 * from a file on disk. Legacy doc/ppt/pptx/xls/xlsx preview through Microsoft's
 * online viewer and zip has no preview at all, so copying them to a lab machine
 * would only produce a card that cannot be opened.
 */

export interface OfflineQuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  imageUrl: string | null;
}

export interface OfflineQuiz {
  id: string;
  title: string;
  questions: OfflineQuizQuestion[];
}

export interface OfflineLibraryItem {
  id: string;
  /** "public" items are shown to anyone at the machine; "personal" ones only to the learner they were fetched for. */
  audience: "public" | "personal";
  title: string;
  description: string;
  contentType: LibraryContentType;
  fileFormat: string | null;
  learningArea: string | null;
  authorName: string;
  fileBytes: number | null;
  pageImageUrls: string[] | null;
  streamUrl: string | null;
  thumbnailUrl: string | null;
  quizzes: OfflineQuiz[];
  /**
   * Hash of everything above. The device re-downloads an item only when this
   * changes, so a lab re-syncing every half hour costs one small request.
   */
  version: string;
}

interface CatalogSource {
  id: string;
  title: string;
  description: string;
  contentType: LibraryContentType;
  fileFormat: string | null;
  learningArea: string | null;
  authorName: string;
  fileBytes: number | null;
}

export function isOfflineCapable(item: { contentType: LibraryContentType; fileFormat: string | null }, playback: LibraryPlaybackInfo): boolean {
  if (playback.pageImageUrls && playback.pageImageUrls.length > 0) return true;
  if (!playback.streamUrl) return false;
  if (item.contentType === "video" || item.contentType === "audiobook") return true;
  return (item.fileFormat ?? "").toLowerCase() === "docx";
}

export function toOfflineItem(
  item: CatalogSource,
  playback: LibraryPlaybackInfo,
  quizzes: LibraryQuiz[],
  audience: "public" | "personal"
): OfflineLibraryItem {
  const body = {
    id: item.id,
    audience,
    title: item.title,
    description: item.description,
    contentType: item.contentType,
    fileFormat: item.fileFormat,
    learningArea: item.learningArea,
    authorName: item.authorName,
    fileBytes: item.fileBytes,
    pageImageUrls: playback.pageImageUrls,
    // Page-image content has no single file; everything else plays from one.
    streamUrl: playback.pageImageUrls ? null : playback.streamUrl,
    thumbnailUrl: playback.thumbnailUrl,
    quizzes: quizzes.map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        imageUrl: q.imageUrl,
      })),
    })),
  };
  const version = createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 32);
  return { ...body, version };
}
