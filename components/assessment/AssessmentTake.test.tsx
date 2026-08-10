// @vitest-environment jsdom

/**
 * Characterisation tests for the paper as it behaves TODAY, over `fetch`.
 *
 * Written before the offline refactor (issue #33, Phase 3) rather than after,
 * because this component is what real learners sit papers in and this repo had
 * no test runner when it was built. These assertions are the contract the
 * refactor must not change: if the offline work alters any behaviour below, the
 * web app has regressed.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ASS0001" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

const auth = {
  isAuthenticated: true,
  loading: false,
  user: { id: "stu-1", role: "student", name: "Test Learner" },
};

vi.mock("@/components/auth/AuthContext", () => ({
  useAuth: () => auth,
}));

import { AssessmentTake } from "./AssessmentTake";

const QUESTIONS = [
  {
    id: "q-1",
    code: "Q1",
    position: 0,
    questionText: "Name the organelle.",
    questionType: "mcq",
    options: ["Nucleus", "Ribosome"],
    maxScore: 1,
  },
  {
    id: "q-2",
    code: "Q2",
    position: 1,
    questionText: "Explain osmosis.",
    questionType: "long",
    options: [],
    maxScore: 5,
  },
];

interface RouteOverrides {
  sittingFails?: boolean;
  remainingSeconds?: number;
  submitFails?: boolean;
}

function mockFetch(overrides: RouteOverrides = {}) {
  const calls: string[] = [];

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);

    if (url.endsWith("/questions")) {
      return jsonResponse({ success: true, data: QUESTIONS });
    }

    if (url.endsWith("/sitting")) {
      if (overrides.sittingFails) throw new TypeError("Failed to fetch");
      return jsonResponse({
        success: true,
        data: { remainingSeconds: overrides.remainingSeconds ?? 3500 },
      });
    }

    if (url.endsWith("/submit")) {
      if (overrides.submitFails) {
        return jsonResponse({ success: false, message: "Submission failed." }, 500);
      }
      return jsonResponse({ success: true });
    }

    // Assessment metadata.
    return jsonResponse({
      success: true,
      data: { title: "Biology Mid-Term", timeLimit: 60 },
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
  } as unknown as Response;
}

function progressKey(part: string) {
  return `tereco_take_stu-1_ASS0001_${part}`;
}

beforeEach(() => {
  push.mockClear();
  localStorage.clear();
  sessionStorage.clear();
  auth.isAuthenticated = true;
  auth.user = { id: "stu-1", role: "student", name: "Test Learner" };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AssessmentTake over the network", () => {
  it("loads the paper and shows the first question", async () => {
    mockFetch();
    render(<AssessmentTake />);

    expect(await screen.findByText("Name the organelle.")).toBeInTheDocument();
    expect(screen.getByText("Biology Mid-Term")).toBeInTheDocument();
  });

  it("restores answers saved under this learner's key", async () => {
    mockFetch();
    localStorage.setItem(progressKey("answers"), JSON.stringify({ "q-1": "Nucleus" }));
    localStorage.setItem(progressKey("index"), "1");

    render(<AssessmentTake />);

    // Index 1 was restored, so the SECOND question is showing.
    expect(await screen.findByText("Explain osmosis.")).toBeInTheDocument();
  });

  it("anchors the sitting on the server before the countdown starts", async () => {
    const { calls } = mockFetch();
    render(<AssessmentTake />);

    await screen.findByText("Name the organelle.");
    await waitFor(() => {
      expect(calls).toContain("POST /api/assessments/ASS0001/sitting");
    });
  });

  it("still lets the learner work when the sitting call fails", async () => {
    // The sitting anchor is the one network call already written to degrade:
    // offline it must not block the paper. This is the behaviour the whole
    // offline effort generalises, so it must not regress.
    mockFetch({ sittingFails: true });
    render(<AssessmentTake />);

    expect(await screen.findByText("Name the organelle.")).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  });

  it("submits the answers and clears the saved progress", async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch();
    render(<AssessmentTake />);

    await screen.findByText("Name the organelle.");
    await user.click(screen.getByText("Nucleus"));

    await waitFor(() => {
      expect(localStorage.getItem(progressKey("answers"))).toContain("Nucleus");
    });

    await user.click(screen.getAllByRole("button", { name: /submit/i })[0]);

    await waitFor(() => {
      expect(calls).toContain("POST /api/assessments/ASS0001/submit");
    });
    await waitFor(() => {
      expect(localStorage.getItem(progressKey("answers"))).toBeNull();
    });
    expect(push).toHaveBeenCalledWith("/student/confirmation?ref=ASS0001");
  });

  it("keeps the work and reports the problem when submission fails", async () => {
    const user = userEvent.setup();
    mockFetch({ submitFails: true });
    render(<AssessmentTake />);

    await screen.findByText("Name the organelle.");
    await user.click(screen.getByText("Nucleus"));
    await user.click(screen.getAllByRole("button", { name: /submit/i })[0]);

    expect(await screen.findByText("Submission failed.")).toBeInTheDocument();
    // The learner's answers must survive a failed submit.
    expect(localStorage.getItem(progressKey("answers"))).toContain("Nucleus");
  });

  it("sends an unauthenticated visitor away from the paper", async () => {
    mockFetch();
    auth.isAuthenticated = false;
    auth.user = null as never;

    render(<AssessmentTake />);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/student");
    });
  });
});
