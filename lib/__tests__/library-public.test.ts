import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { toPublicLibraryItem } from "@/lib/library-public";
import { filesOf, localCheck, pagesOf, toPlayableQuiz } from "@/lib/library-offline-store";
import type { OfflineLibraryItem } from "@/lib/library-offline";

const { parseByteRange } = createRequire(import.meta.url)("../../public/sw-range.js") as {
  parseByteRange: (header: string | null, size: number) => { start: number; end: number } | { unsatisfiable: true } | null;
};

describe("toPublicLibraryItem", () => {
  it("hands out what the cards and viewers render, and none of the internals", () => {
    const row = {
      id: "c1",
      title: "Photosynthesis",
      description: "Notes",
      contentType: "notes" as const,
      cloudinaryPublicId: "library/secret-public-id",
      cloudinaryResourceType: "image" as const,
      fileBytes: 10,
      fileFormat: "pdf",
      pageCount: 2,
      downloadable: false,
      learningArea: "Science",
      createdBy: "profile-uuid-of-teacher",
      createdAt: "2026-09-01T00:00:00Z",
      authorName: "T. Teacher",
    };
    const out = toPublicLibraryItem(row as never, {
      streamUrl: null,
      pageImageUrls: ["p1", "p2"],
      downloadAvailable: false,
      downloadUrl: null,
      thumbnailUrl: "t",
    });
    expect(out).toMatchObject({ id: "c1", title: "Photosynthesis", authorName: "T. Teacher", pageImageUrls: ["p1", "p2"] });
    const json = JSON.stringify(out);
    expect(json).not.toContain("secret-public-id");
    expect(json).not.toContain("profile-uuid-of-teacher");
  });
});

describe("parseByteRange (public/sw-range.js)", () => {
  it("answers the ranges a <video> asks for", () => {
    expect(parseByteRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseByteRange("bytes=100-199", 1000)).toEqual({ start: 100, end: 199 });
    expect(parseByteRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
  });

  it("refuses ranges past the end, and ignores what it cannot parse", () => {
    expect(parseByteRange("bytes=1000-", 1000)).toEqual({ unsatisfiable: true });
    expect(parseByteRange("bytes=-", 1000)).toBeNull();
    expect(parseByteRange("items=0-1", 1000)).toBeNull();
    expect(parseByteRange(null, 1000)).toBeNull();
  });
});

describe("offline store helpers", () => {
  const item: OfflineLibraryItem = {
    id: "c1",
    audience: "public",
    title: "T",
    description: "",
    contentType: "notes",
    fileFormat: "pdf",
    learningArea: null,
    authorName: "",
    fileBytes: null,
    pageImageUrls: ["https://res.cloudinary.com/p1", "https://res.cloudinary.com/p2"],
    streamUrl: null,
    thumbnailUrl: "https://res.cloudinary.com/p1",
    quizzes: [
      {
        id: "q",
        title: "Quiz",
        questions: [
          { id: "a", prompt: "?", options: ["x", "y"], correctIndex: 1, explanation: "because", imageUrl: "https://res.cloudinary.com/img" },
        ],
      },
    ],
    version: "v1",
  };

  it("lists every file once, quiz images included", () => {
    expect(filesOf(item)).toEqual(["https://res.cloudinary.com/p1", "https://res.cloudinary.com/p2", "https://res.cloudinary.com/img"]);
  });

  it("keeps the detail page and each quiz page", () => {
    expect(pagesOf(item)).toEqual(["/library/c1", "/library/c1/quiz/q"]);
  });

  it("marks offline against the saved key, and the playable copy carries no answers", async () => {
    const check = localCheck(item.quizzes[0]);
    await expect(check("a", 1)).resolves.toEqual({ correct: true, correctIndex: 1, explanation: "because" });
    await expect(check("a", 0)).resolves.toMatchObject({ correct: false });
    expect(JSON.stringify(toPlayableQuiz(item.quizzes[0]))).not.toContain("correctIndex");
  });
});
