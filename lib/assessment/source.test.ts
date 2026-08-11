// @vitest-environment jsdom

/**
 * Practice and a real sitting must never touch each other's work.
 *
 * A learner may practise a paper they have already sat, and both use the same
 * assessment id. Without separate keys, opening the practice version restores
 * the answers from their real sitting and then overwrites them — turning
 * revision into data loss on a paper that has already been submitted.
 *
 * These tests exist because that separation moved. It used to live in
 * AssessmentTake alongside the E-Papers work; the offline client pulled all
 * storage into the source, and a merge is exactly where a rule like this gets
 * quietly dropped.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { webSource, type PaperContext } from "./source";

const live: PaperContext = { mode: "live", studentId: "stu-1", assessmentId: "ASS0001" };
const practice: PaperContext = { mode: "practice", studentId: "stu-1", assessmentId: "ASS0001" };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("progress storage", () => {
  it("keeps practice answers out of the live sitting's keys", () => {
    webSource.saveProgress(live, { q1: "real answer" }, 0);
    webSource.saveProgress(practice, { q1: "practice answer" }, 2);

    expect(localStorage.getItem("tereco_take_stu-1_ASS0001_answers")).toContain("real answer");
    expect(localStorage.getItem("tereco_practice_stu-1_ASS0001_answers")).toContain(
      "practice answer"
    );
  });

  it("does not let a finished practice run clear a live sitting", () => {
    webSource.saveProgress(live, { q1: "real answer" }, 3);
    webSource.clearProgress(practice);

    // The real sitting may still be in progress in another tab.
    expect(localStorage.getItem("tereco_take_stu-1_ASS0001_answers")).toContain("real answer");
    expect(localStorage.getItem("tereco_take_stu-1_ASS0001_index")).toBe("3");
  });

  it("clears its own keys on a live submit", () => {
    webSource.saveProgress(live, { q1: "real answer" }, 3);
    webSource.clearProgress(live);

    expect(localStorage.getItem("tereco_take_stu-1_ASS0001_answers")).toBeNull();
    expect(localStorage.getItem("tereco_take_stu-1_ASS0001_index")).toBeNull();
  });

  it("keeps the countdown start separate per mode", () => {
    webSource.writeStart(live, 1000);
    webSource.writeStart(practice, 9999);

    expect(webSource.readStart(live)).toBe(1000);
    expect(webSource.readStart(practice)).toBe(9999);
  });

  it("restores a live sitting from the legacy sessionStorage keys", () => {
    // Anyone mid-paper across the deploy that introduced the localStorage
    // scheme still has their answers under the old names.
    sessionStorage.setItem("assessment_ASS0001_start", "4242");
    expect(webSource.readStart(live)).toBe(4242);
  });

  it("never reads the legacy keys for practice", () => {
    sessionStorage.setItem("assessment_ASS0001_start", "4242");
    // Reading them would pull a real sitting's timing into a practice run.
    expect(webSource.readStart(practice)).toBeNull();
  });
});

describe("submitting", () => {
  function stubFetch(body: unknown) {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => body,
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("posts a live sitting to the assessment submit route with its timing", async () => {
    const fetchMock = stubFetch({ success: true });

    const result = await webSource.submit(live, { answers: { q1: "A" }, timeSpent: 120 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/assessments/ASS0001/submit");
    expect(JSON.parse(init.body as string)).toEqual({ answers: { q1: "A" }, timeSpent: 120 });
    expect(result).toEqual({});
  });

  it("posts practice to the E-Paper route, without timing", async () => {
    const fetchMock = stubFetch({ success: true, data: { attemptId: "att-9" } });

    const result = await webSource.submit(practice, { answers: { q1: "A" }, timeSpent: 120 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/e-papers/ASS0001/attempt");
    // No time limit to check it against, and the attempt row records its own
    // start and finish.
    expect(JSON.parse(init.body as string)).toEqual({ answers: { q1: "A" } });
    // Returned so the caller can send the learner straight to the marked paper.
    expect(result).toEqual({ attemptId: "att-9" });
  });
});

describe("loading", () => {
  it("does not open a sitting for a practice run", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith("/questions")
          ? { success: true, data: [] }
          : { success: true, data: { title: "Closed Paper", timeLimit: 40 } },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const paper = await webSource.load(practice);

    // /sitting opens a real sitting window against a live assessment; calling
    // it for a closed paper would either fail or, worse, record something.
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/sitting"))).toBe(false);
    // Untimed: zero is what switches the whole clock off downstream.
    expect(paper.timeLimitSeconds).toBe(0);
  });
});
