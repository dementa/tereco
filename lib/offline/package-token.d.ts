/**
 * Types for lib/offline/package-token.js.
 *
 * The implementation is CommonJS so the Electron main process (Node 20, no
 * TypeScript at runtime) and the Next.js route can share one copy of the
 * signing format. See the header comment in the .js for why.
 */

export declare const PACKAGE_TOKEN_ALG: "EdDSA";

export declare class PackageTokenError extends Error {
  constructor(message: string);
}

export interface PackageClaims {
  /** Key that signed this, so the signing key can be rotated without bricking
   *  every installed machine. Verifiers hold a map of id -> public key. */
  kid: string;
  studentId: string;
  assessmentId: string;
  /** The public ASS#### id, so the device can match what it was asked for. */
  assessmentSystemId: string;
  /** Epoch ms. From `assessment_sittings.started_at`, never from the client:
   *  this is what stops a restart granting a fresh clock. */
  startedAt: number;
  durationSeconds: number;
  /** Which machine the grant was issued to. */
  deviceId: string;
  /** Epoch ms after which the grant is refused. */
  validUntil: number;
  /** sha256 over the canonical package content, so integrity and authorisation
   *  are one signed mechanism rather than two independent fields. */
  contentHash: string;
}

/** Deterministic JSON with keys sorted at every level. */
export declare function canonicalise(value: unknown): string;

export declare function hashContent(content: unknown): string;

export declare function signPackageToken(claims: PackageClaims, privateKeyPem: string): string;

export declare function verifyPackageToken(
  token: string,
  publicKeys: Readonly<Record<string, string>>,
  now?: number
): PackageClaims;

export declare function assertContentMatches(claims: PackageClaims, content: unknown): void;
