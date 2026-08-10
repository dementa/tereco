// @vitest-environment jsdom

/**
 * The same paper, sat with the internet switched off (issue #33, Phase 3).
 *
 * Identical component to the web tests next door. The only difference is that
 * `window.tereco` exists, so `resolveSource()` picks the local database instead
 * of the API. That is the point of the refactor: one take screen, two sources,
 * no fork to drift.
 *
 * `fetch` is stubbed to throw here. If any of these tests pass while the
 * component is quietly reaching the network, the offline claim is false, and
 * the failure would otherwise only show up in a computer lab with the cable
 * out.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ASS0001" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/auth/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    loading: false,
    user: { id: "stu-1", role: "student", name: "Test Learner" },
  }),
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

interface BridgeOptions {
  answers?: Record<string, string>;
  currentIndex?: number;
  remainingSeconds?: number;
  prepared?: boolean;
}

function stubBridge(options: BridgeOptions = {}) {
  const bridge = {
    getPackage: vi.fn(async () =>
      options.prepared === false
        ? null
        : { title: "Biology Mid-Term", durationSeconds: 3600 }
    ),
    getQuestions: vi.fn(async () => QUESTIONS),
    getAttempt: vi.fn(async () => ({
      attemptId: "attempt-1",
      answers: options.answers ?? {},
      currentIndex: options.currentIndex ?? 0,
      remainingSeconds: options.remainingSeconds ?? 3500,
      status: "in_progress" as const,
    })),
    saveAnswer: vi.fn(async () => {}),
    saveIndex: vi.fn(async () => {}),
    submit: vi.fn(async () => ({ queued: true as const })),
  };

  vi.stubGlobal("tereco", bridge);

  // Nothing in an offline sitting may touch the network. Throwing rather than
  // returning an empty result means a stray call fails the test loudly instead
  // of degrading quietly.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("The offline paper must not reach the network.");
    })
  );

  return bridge;
}

beforeEach(() => {
  push.mockClear();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AssessmentTake with no network", () => {
  it("loads the paper from the local database", async () => {
    const bridge = stubBridge();
    render(<AssessmentTake />);

    expect(await screen.findByText("Name the organelle.")).toBeInTheDocument();
    expect(screen.getByText("Biology Mid-Term")).toBeInTheDocument();
    expect(bridge.getQuestions).toHaveBeenCalledWith("ASS0001");
  });

  it("resumes an interrupted attempt where the learner left off", async () => {
    stubBridge({ answers: { "q-1": "Nucleus" }, currentIndex: 1 });
    render(<AssessmentTake />);

    // Restored to the second question, not thrown back to the first.
    expect(await screen.findByText("Explain osmosis.")).toBeInTheDocument();
  });

  it("writes each answer to the local database as it changes", async () => {
    const user = userEvent.setup();
    const bridge = stubBridge();
    render(<AssessmentTake />);

    await screen.findByText("Name the organelle.");
    await user.click(screen.getByText("Nucleus"));

    await waitFor(() => {
      expect(bridge.saveAnswer).toHaveBeenCalledWith("attempt-1", "q-1", "Nucleus");
    });
  });

  it("does not rewrite an answer that has not changed", async () => {
    const user = userEvent.setup();
    const bridge = stubBridge();
    render(<AssessmentTake />);

    await screen.findByText("Name the organelle.");
    await user.click(screen.getByText("Nucleus"));
    await waitFor(() => expect(bridge.saveAnswer).toHaveBeenCalledTimes(1));

    // Moving between questions re-runs the persist effect with the same
    // answers. Each write costs an fsync, so replaying them would put growing
    // disk I/O in the path of typing.
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Explain osmosis.");

    expect(bridge.saveAnswer).toHaveBeenCalledTimes(1);
  });

  it("submits to the local queue rather than the network", async () => {
    const user = userEvent.setup();
    const bridge = stubBridge();
    render(<AssessmentTake />);

    await screen.findByText("Name the organelle.");
    await user.click(screen.getByText("Nucleus"));
    await user.click(screen.getAllByRole("button", { name: /submit/i })[0]);

    await waitFor(() => {
      expect(bridge.submit).toHaveBeenCalledWith("attempt-1");
    });
    expect(push).toHaveBeenCalledWith("/student/confirmation?ref=ASS0001");
  });

  it("takes its countdown from the local database, not a stored start", async () => {
    // 1800 of 3600 seconds gone. The desktop clock comes from the signed
    // package and is floored against tampering, so there is no local start to
    // fall back to and nothing a learner can edit to buy time.
    stubBridge({ remainingSeconds: 1800 });
    render(<AssessmentTake />);

    await screen.findByText("Name the organelle.");
    expect(await screen.findByText(/29:5\d|30:00/)).toBeInTheDocument();
  });

  it("says so plainly when the paper was never prepared on this computer", async () => {
    stubBridge({ prepared: false });
    render(<AssessmentTake />);

    expect(
      await screen.findByText(/has not been prepared on this computer/i)
    ).toBeInTheDocument();
  });
});
