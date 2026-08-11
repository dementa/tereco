import { UserFacingError } from "@/lib/apiResponse";

/**
 * Server-side access to the package signing key.
 *
 * The private key exists only in the deployment environment. It is never
 * bundled, never sent to a client, and never logged. The matching public key
 * ships inside TERECO Collect so a lab machine can verify a grant with no
 * network and no secret of its own.
 *
 * Generate a pair with `node scripts/gen-package-keys.mjs`.
 */

/** How long a grant stays usable, covering the sitting AND the later sync. */
export const PACKAGE_GRANT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function readEnv(name: string): string {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") {
    // A 500 with a generic message would send someone hunting through logs.
    // This is a deployment configuration problem and saying so is safe: it
    // names the variable, never its value.
    throw new UserFacingError(
      `Offline assessment packages are not configured on this server (${name} is unset).`,
      503
    );
  }
  // Hosting dashboards commonly store PEMs with escaped newlines.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export function packageSigningKey(): string {
  return readEnv("TERECO_PACKAGE_SIGNING_KEY");
}

export function packageKeyId(): string {
  return readEnv("TERECO_PACKAGE_KEY_ID");
}
