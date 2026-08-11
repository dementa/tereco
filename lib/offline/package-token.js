'use strict';

/**
 * Signed grants for offline assessment packages (issue #33).
 *
 * A lab machine holds the paper in a SQLite file the student can open and edit.
 * Storing `student_id` there proves nothing: change the row, sit someone else's
 * paper. So authorisation does not live in the database at all — it lives in
 * this token, signed by the server and verified on the device.
 *
 * Ed25519 rather than an HMAC because the verifying half ships to ~50 lab
 * machines. A shared secret on those machines would let anyone holding one mint
 * their own grants; a public key lets them check signatures and forge nothing.
 *
 * The format is JWS-compact-like (`header.payload.signature`, base64url) but is
 * deliberately NOT a JWT: no library, no `alg` negotiation, and therefore none
 * of the algorithm-confusion footguns. `alg` is checked against one value.
 *
 * ─── Why this file is CommonJS in a TypeScript codebase ─────────────────────
 * It has two callers that cannot share a build: the Next.js route (TS, bundled)
 * and the Electron main process (CommonJS, Node 20, no TypeScript at runtime).
 * A second implementation for the desktop would be two copies of the exact code
 * where a silent disagreement — one different byte out of `canonicalise` — makes
 * good packages fail to verify on a lab machine at exam time. Types live in the
 * sibling package-token.d.ts, so the TS side still gets full checking.
 */

const { createHash, createPrivateKey, createPublicKey, sign, verify } = require('node:crypto');

const PACKAGE_TOKEN_ALG = 'EdDSA';

class PackageTokenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PackageTokenError';
  }
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function fromB64url(input) {
  return Buffer.from(input, 'base64url');
}

/**
 * Deterministic JSON: keys sorted at every level.
 *
 * `JSON.stringify` preserves insertion order, so two structurally identical
 * payloads can serialise differently and hash differently. The device
 * recomputes this hash from data that has been through SQLite, where column
 * order is ours and not the server's, so the ordering has to be pinned or
 * verification fails on a package that is perfectly good.
 */
function canonicalise(value) {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? 'null' : encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;

  const entries = Object.entries(value)
    // undefined is absent, not null: it must not become a key, or a payload
    // built with an optional field omitted would hash differently from the
    // same payload built with it explicitly undefined.
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(',')}}`;
}

function hashContent(content) {
  return createHash('sha256').update(canonicalise(content)).digest('hex');
}

/**
 * Signs a grant. Server-side only — the private key never leaves the deployment.
 */
function signPackageToken(claims, privateKeyPem) {
  const header = { alg: PACKAGE_TOKEN_ALG, kid: claims.kid };
  const signingInput = `${b64url(canonicalise(header))}.${b64url(canonicalise(claims))}`;

  // Ed25519 takes no separate digest: the algorithm hashes internally, so the
  // first argument must be null rather than 'sha256'.
  const signature = sign(null, Buffer.from(signingInput), createPrivateKey(privateKeyPem));

  return `${signingInput}.${b64url(signature)}`;
}

/**
 * Verifies a grant and returns its claims.
 *
 * Throws on anything that is not a valid, current, correctly signed grant.
 * Every failure is fatal by design: there is no "probably fine" reading of a
 * package whose signature does not check out.
 *
 * `publicKeys` is a map of key id -> SPKI PEM rather than a single key, so a
 * machine installed before a rotation still verifies grants signed by the key
 * it already knows.
 */
function verifyPackageToken(token, publicKeys, now = Date.now()) {
  if (typeof token !== 'string') throw new PackageTokenError('Malformed package token.');

  const parts = token.split('.');
  if (parts.length !== 3) throw new PackageTokenError('Malformed package token.');

  const [encodedHeader, encodedClaims, encodedSignature] = parts;

  let header;
  let claims;
  try {
    header = JSON.parse(fromB64url(encodedHeader).toString('utf8'));
    claims = JSON.parse(fromB64url(encodedClaims).toString('utf8'));
  } catch {
    throw new PackageTokenError('Package token is not readable.');
  }

  if (header.alg !== PACKAGE_TOKEN_ALG) {
    throw new PackageTokenError(`Unsupported signature algorithm: ${header.alg}`);
  }

  // The header's kid selects the key, and the claims' kid is what was signed.
  // If they disagree, someone edited the unsigned header to point verification
  // at a different key.
  if (!header.kid || header.kid !== claims.kid) {
    throw new PackageTokenError('Package token key id does not match its claims.');
  }

  const publicKeyPem = publicKeys[header.kid];
  if (!publicKeyPem) {
    throw new PackageTokenError(
      `This copy of TERECO Collect does not know the key "${header.kid}" that signed this package. It may need updating.`
    );
  }

  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const ok = verify(
    null,
    Buffer.from(signingInput),
    createPublicKey(publicKeyPem),
    fromB64url(encodedSignature)
  );
  if (!ok) throw new PackageTokenError('Package signature is not valid.');

  if (typeof claims.validUntil !== 'number' || claims.validUntil <= now) {
    throw new PackageTokenError('This assessment package has expired.');
  }

  return claims;
}

/**
 * Confirms the package content is the content that was signed.
 *
 * Separate from `verifyPackageToken` because the device checks it twice: once
 * when the download lands, and again when the paper is opened, by which time
 * the file has been sitting on a machine the student controls.
 */
function assertContentMatches(claims, content) {
  if (hashContent(content) !== claims.contentHash) {
    throw new PackageTokenError(
      'This assessment package does not match what the server signed. It may be damaged or altered.'
    );
  }
}

module.exports = {
  PACKAGE_TOKEN_ALG,
  PackageTokenError,
  canonicalise,
  hashContent,
  signPackageToken,
  verifyPackageToken,
  assertContentMatches,
};
