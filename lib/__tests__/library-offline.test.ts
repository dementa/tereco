import { describe, expect, it } from "vitest";
import { isOfflineCapable, toOfflineItem } from "@/lib/library-offline";

const noPlayback = { streamUrl: null, pageImageUrls: null, downloadAvailable: false, downloadUrl: null, thumbnailUrl: null };

describe("isOfflineCapable", () => {
  it("accepts PDFs (page images), video, audio and docx", () => {
    expect(isOfflineCapable({ contentType: "document", fileFormat: "pdf" }, { ...noPlayback, pageImageUrls: ["p1"] })).toBe(true);
    expect(isOfflineCapable({ contentType: "video", fileFormat: "mp4" }, { ...noPlayback, streamUrl: "v" })).toBe(true);
    expect(isOfflineCapable({ contentType: "audiobook", fileFormat: "mp3" }, { ...noPlayback, streamUrl: "a" })).toBe(true);
    expect(isOfflineCapable({ contentType: "notes", fileFormat: "DOCX" }, { ...noPlayback, streamUrl: "d" })).toBe(true);
  });

  it("refuses formats that need the online Office viewer or have no preview", () => {
    for (const fileFormat of ["doc", "ppt", "pptx", "xls", "xlsx", "zip"]) {
      expect(isOfflineCapable({ contentType: "support_file", fileFormat }, { ...noPlayback, streamUrl: "x" })).toBe(false);
    }
  });
});

describe("toOfflineItem", () => {
  const source = {
    id: "doc-1",
    title: "Notes",
    description: "",
    contentType: "notes" as const,
    fileFormat: "pdf",
    learningArea: null,
    authorName: "",
    fileBytes: null,
  };
  const quiz = {
    id: "quiz-1",
    contentId: "doc-1",
    title: "Quiz",
    status: "published" as const,
    createdBy: "t-1",
    questions: [{ id: "q1", prompt: "?", options: ["a", "b"], correctIndex: 1, explanation: null, imageUrl: null, imagePublicId: "secret/id" }],
  };

  it("changes version when a quiz changes, and not otherwise", () => {
    const playback = { ...noPlayback, pageImageUrls: ["p1"] };
    const a = toOfflineItem(source, playback, [quiz], "public");
    expect(toOfflineItem(source, playback, [quiz], "public").version).toBe(a.version);
    const edited = { ...quiz, questions: [{ ...quiz.questions[0], correctIndex: 0 }] };
    expect(toOfflineItem(source, playback, [edited], "public").version).not.toBe(a.version);
  });

  it("does not carry Cloudinary public ids", () => {
    const out = toOfflineItem(source, { ...noPlayback, pageImageUrls: ["p1"] }, [quiz], "public");
    expect(JSON.stringify(out)).not.toContain("secret/id");
  });
});
