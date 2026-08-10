import type { User } from "@/components/auth/AuthContext";

/**
 * Where the signed-in identity is rehydrated from on page load.
 *
 * In a browser that is `/api/auth/me`, as it has always been. In TERECO Collect
 * it is the local database, because the lab switches the internet off after a
 * learner signs in and the network call cannot be made.
 *
 * This closes the last thing that ejected a learner from their own paper
 * offline. `/api/auth/me` failing was read as "nobody is signed in", so the
 * guard in AssessmentTake pushed them back to the student home — locking them
 * out of a paper they were holding locally and part-way through.
 *
 * The desktop answer is deliberately NOT proof of anything. It says who last
 * signed in on this machine, which is enough to render a name and scope a
 * query. Authorisation to sit a paper comes from the signed package, verified
 * in the main process, and from nothing that lives in the renderer.
 */

export interface Identity {
  user: User | null;
  mustChangePassword: boolean;
}

const SIGNED_OUT: Identity = { user: null, mustChangePassword: false };

/** The slice of `window.tereco` the session needs. */
interface SessionBridge {
  currentUser(): Promise<{
    id: string;
    staffId: string;
    name: string;
    role: string;
    school: string;
    className?: string | null;
  } | null>;
  signOut(): Promise<void>;
}

function sessionBridge(): SessionBridge | null {
  return (globalThis as { tereco?: SessionBridge }).tereco ?? null;
}

export async function loadIdentity(): Promise<Identity> {
  const bridge = sessionBridge();

  if (bridge) {
    try {
      const user = await bridge.currentUser();
      // No password change prompt offline: changing one needs the server, so
      // raising it here would block a learner behind a form that cannot submit.
      return user ? { user: user as User, mustChangePassword: false } : SIGNED_OUT;
    } catch {
      return SIGNED_OUT;
    }
  }

  try {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    if (!data.success) return SIGNED_OUT;
    return { user: data.user, mustChangePassword: !!data.user.mustChangePassword };
  } catch {
    return SIGNED_OUT;
  }
}

export async function endSession(): Promise<void> {
  const bridge = sessionBridge();

  if (bridge) {
    // Clears the active learner locally. Prepared packages stay on the machine:
    // they belong to whoever downloaded them, and unsent work must survive a
    // sign-out or a shared desk would lose a paper every time someone left.
    await bridge.signOut().catch(() => {});
    return;
  }

  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
}
