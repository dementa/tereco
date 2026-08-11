// @vitest-environment jsdom

/**
 * Session rehydration, online and off.
 *
 * The offline cases here are the last thing that ejected a learner from their
 * own paper: `/api/auth/me` fails with no network, which the app read as
 * "nobody is signed in", so the guard in AssessmentTake pushed them back to the
 * student home — locking them out of a paper they were holding locally and
 * part-way through.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "./AuthContext";

function Probe() {
  const { user, isAuthenticated, loading, mustChangePassword } = useAuth();
  if (loading) return <p>loading</p>;
  return (
    <div>
      <p data-testid="state">{isAuthenticated ? "signed-in" : "signed-out"}</p>
      <p data-testid="name">{user?.name ?? "-"}</p>
      <p data-testid="must-change">{mustChangePassword ? "yes" : "no"}</p>
    </div>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session in a browser", () => {
  it("rehydrates the signed-in learner from the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          user: { id: "stu-1", name: "Test Learner", role: "student", staffId: "TST1", school: "X" },
        }),
      }))
    );

    renderAuth();

    expect(await screen.findByTestId("state")).toHaveTextContent("signed-in");
    expect(screen.getByTestId("name")).toHaveTextContent("Test Learner");
  });

  it("surfaces a required password change", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          user: {
            id: "stu-1",
            name: "Test Learner",
            role: "student",
            staffId: "TST1",
            school: "X",
            mustChangePassword: true,
          },
        }),
      }))
    );

    renderAuth();

    expect(await screen.findByTestId("must-change")).toHaveTextContent("yes");
  });

  it("treats an unreachable server as signed out", async () => {
    // Correct in a browser: with no local paper to protect, there is nothing to
    // let the visitor into. The desktop case below is the one that differs.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    renderAuth();

    expect(await screen.findByTestId("state")).toHaveTextContent("signed-out");
  });
});

describe("session in TERECO Collect", () => {
  function stubBridge(user: unknown) {
    vi.stubGlobal("tereco", {
      currentUser: vi.fn(async () => user),
      signOut: vi.fn(async () => {}),
    });

    // There is no network during a sitting. A call here means the offline
    // promise is false, so make it fail the test rather than degrade quietly.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("The offline session must not reach the network.");
      })
    );
  }

  it("keeps the learner signed in with no network at all", async () => {
    stubBridge({
      id: "stu-1",
      staffId: "TST2026001",
      name: "Test Learner",
      role: "student",
      school: "",
      className: "P.6 Blue",
    });

    renderAuth();

    expect(await screen.findByTestId("state")).toHaveTextContent("signed-in");
    expect(screen.getByTestId("name")).toHaveTextContent("Test Learner");
  });

  it("never raises a password change it could not complete offline", async () => {
    stubBridge({
      id: "stu-1",
      staffId: "TST2026001",
      name: "Test Learner",
      role: "student",
      school: "",
    });

    renderAuth();

    // Changing a password needs the server, so prompting for one offline would
    // block the learner behind a form that cannot submit.
    expect(await screen.findByTestId("must-change")).toHaveTextContent("no");
  });

  it("reports signed out when nobody has prepared on this machine", async () => {
    stubBridge(null);

    renderAuth();

    expect(await screen.findByTestId("state")).toHaveTextContent("signed-out");
  });

  it("stays usable when the local database cannot be read", async () => {
    vi.stubGlobal("tereco", {
      currentUser: vi.fn(async () => {
        throw new Error("database is locked");
      }),
      signOut: vi.fn(async () => {}),
    });
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("The offline session must not reach the network.");
    }));

    renderAuth();

    // Signed out rather than stuck on the loading screen forever.
    expect(await screen.findByTestId("state")).toHaveTextContent("signed-out");
  });
});
