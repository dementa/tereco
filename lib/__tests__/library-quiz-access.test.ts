import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const session = vi.hoisted(() => ({ profile: null as null | { id: string; role: string } }));
const store = vi.hoisted(() => ({
  quiz: null as null | { id: string; contentId: string; status: "draft" | "published" },
  isPublic: false,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: async () => session.profile,
  requireRole: async () => (session.profile ? null : new Response("Unauthorized", { status: 401 })),
}));
vi.mock("@/lib/auth/access", () => ({ canManageLibraryContent: () => false }));
vi.mock("@/lib/entities/library-content", () => ({
  isPublicLibraryContent: async () => store.isPublic,
  getLibraryContentById: async (id: string) => ({ id }),
  canProfileViewLibraryContent: async () => true,
}));
vi.mock("@/lib/entities/library-quizzes", () => ({ getQuiz: async () => store.quiz }));

const { loadQuiz } = await import("@/lib/library-quiz-access");
const request = {} as NextRequest;

describe("loadQuiz, signed out", () => {
  beforeEach(() => {
    session.profile = null;
    store.quiz = { id: "q", contentId: "c", status: "published" };
    store.isPublic = true;
  });

  it("plays a published quiz on a public item", async () => {
    const loaded = await loadQuiz(request, "q", "play");
    expect("quiz" in loaded && loaded.profile).toBeNull();
  });

  it("does not reveal a quiz on a targeted (non-public) item", async () => {
    store.isPublic = false;
    const loaded = await loadQuiz(request, "q", "play");
    expect("response" in loaded && loaded.response.status).toBe(404);
  });

  it("does not reveal a draft, even on a public item", async () => {
    store.quiz = { id: "q", contentId: "c", status: "draft" };
    const loaded = await loadQuiz(request, "q", "play");
    expect("response" in loaded && loaded.response.status).toBe(404);
  });

  it("never lets an anonymous caller manage", async () => {
    const loaded = await loadQuiz(request, "q", "manage");
    expect("response" in loaded && loaded.response.status).toBe(401);
  });
});
