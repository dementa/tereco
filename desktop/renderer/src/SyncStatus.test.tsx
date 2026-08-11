// @vitest-environment jsdom

/**
 * The five synchronisation states from issue #33.
 *
 * One rule runs through all of them and is what these tests actually guard:
 * a learner or a teacher must never be able to read this strip and conclude
 * that work has been lost. The failure state especially — the person reading it
 * has no way to check and every reason to assume the worst.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SyncStatus } from "./SyncStatus";

function stubBridge(status: unknown, retryResult?: unknown) {
  const bridge = {
    syncStatus: vi.fn(async () => status),
    retrySync: vi.fn(async () => retryResult ?? status),
  };
  vi.stubGlobal("tereco", bridge);
  return bridge;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sync status strip", () => {
  it("shows nothing on a machine that has never queued anything", async () => {
    stubBridge({ state: "idle", pending: 0, total: 0, lastError: null });
    const { container } = render(<SyncStatus />);

    // A green "all synchronised" here would be noise, not reassurance.
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("counts the work still waiting", async () => {
    stubBridge({ state: "idle", pending: 5, total: 5, lastError: null });
    render(<SyncStatus />);

    expect(await screen.findByText(/5 assessments are waiting to sync/i)).toBeInTheDocument();
    expect(screen.getByText(/saved on this computer/i)).toBeInTheDocument();
  });

  it("reports progress while uploading", async () => {
    stubBridge({ state: "syncing", pending: 2, total: 5, lastError: null });
    render(<SyncStatus />);

    expect(await screen.findByText(/3 \/ 5 submissions uploaded/i)).toBeInTheDocument();
  });

  it("confirms when everything has landed", async () => {
    stubBridge({ state: "complete", pending: 0, total: 5, lastError: null });
    render(<SyncStatus />);

    expect(await screen.findByText(/Synchronization complete/i)).toBeInTheDocument();
    expect(screen.getByText(/5 \/ 5 submissions uploaded/i)).toBeInTheDocument();
  });

  it("says the work is safe even when the upload failed", async () => {
    stubBridge({ state: "idle", pending: 2, total: 5, lastError: "Network error" });
    render(<SyncStatus />);

    expect(await screen.findByText(/2 submissions could not be uploaded/i)).toBeInTheDocument();
    // The sentence that stops someone concluding a paper is gone.
    expect(
      screen.getByText(/still safely stored on this computer/i)
    ).toBeInTheDocument();
  });

  it("lets someone standing at the machine retry immediately", async () => {
    const user = userEvent.setup();
    const bridge = stubBridge(
      { state: "idle", pending: 2, total: 5, lastError: "Network error" },
      { state: "complete", pending: 0, total: 5, lastError: null }
    );

    render(<SyncStatus />);
    await screen.findByText(/could not be uploaded/i);

    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(bridge.retrySync).toHaveBeenCalled();
    expect(await screen.findByText(/Synchronization complete/i)).toBeInTheDocument();
  });

  it("uses a polite live region so a learner mid-paper is not interrupted", async () => {
    stubBridge({ state: "idle", pending: 1, total: 1, lastError: null });
    render(<SyncStatus />);

    const strip = await screen.findByRole("status");
    expect(strip).toHaveAttribute("aria-live", "polite");
  });

  it("stays quiet when the local database cannot be read", async () => {
    vi.stubGlobal("tereco", {
      syncStatus: vi.fn(async () => {
        throw new Error("database is locked");
      }),
      retrySync: vi.fn(),
    });

    const { container } = render(<SyncStatus />);

    // The paper screens report that far more usefully than a status strip can.
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
