import crypto from "crypto";

/**
 * Signed Cloudinary uploads.
 *
 * The browser uploads the file straight to Cloudinary rather than through this
 * server: a proxied upload would burn double the bandwidth and run into request
 * body limits for no benefit. What keeps that safe is that the browser cannot
 * upload anything it likes — the server decides the `public_id` and folder, and
 * signs them. The API secret never leaves the server. (The API *key* is not a
 * secret; it is designed to be public.)
 *
 * The public_id is DETERMINISTIC — `tereco/profiles/<profileId>` — so replacing
 * someone's photo overwrites the existing asset in place instead of piling up
 * orphaned copies nobody can identify.
 */

export type UploadKind = "profile" | "school" | "question" | "script" | "library";

const FOLDERS: Record<UploadKind, string> = {
  profile: "tereco/profiles",
  school: "tereco/schools",
  question: "tereco/questions",
  // One folder per submission, one asset per page.
  script: "tereco/scripts",
  library: "tereco/library",
};

/** Cloudinary asset kind. Everything before "library" has been an image. */
export type CloudinaryResourceType = "image" | "video" | "raw";

/**
 * "upload" = anyone with the delivery URL can view it (fine for profile
 * photos and school logos). "authenticated" = Cloudinary refuses to serve
 * the bytes at all without a valid signature — used for every Library asset
 * except past_paper downloads, since "view-only" needs the platform itself
 * to be the thing deciding who gets bytes, not a guessable public URL.
 */
export type CloudinaryDeliveryType = "upload" | "authenticated";

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function getCloudinaryConfig(): CloudinaryConfig {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const missing = [
    !cloudName && "CLOUDINARY_CLOUD_NAME",
    !apiKey && "CLOUDINARY_API_KEY",
    !apiSecret && "CLOUDINARY_API_SECRET",
  ].filter(Boolean);

  if (missing.length) {
    // Named explicitly because the usual cause is a typo in .env.local, and
    // "upload failed" tells you nothing about which key is wrong.
    throw new Error(`Cloudinary is not configured — missing ${missing.join(", ")}`);
  }

  return { cloudName: cloudName!, apiKey: apiKey!, apiSecret: apiSecret! };
}

/**
 * Cloudinary's signing scheme: take every parameter that will be sent (except
 * `file`, `api_key`, `resource_type` and `cloud_name`), sort by key, join as
 * `k=v&k=v`, append the API secret, then SHA-1 the result.
 */
function sign(params: Record<string, string | number>, apiSecret: string): string {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(canonical + apiSecret).digest("hex");
}

/**
 * Where an asset lives.
 *
 * Question images take a `slot` (the question's position) rather than the
 * question's own id, because saving a paper deletes and re-inserts every
 * question — so question ids change on every save and an id-keyed image would
 * be orphaned the moment the paper was edited. Assessment id + position is
 * stable across re-saves.
 */
export function buildPublicId(kind: UploadKind, entityId: string, slot?: number): string {
  const base = `${FOLDERS[kind]}/${entityId}`;
  return slot === undefined ? base : `${base}/q${slot}`;
}

export interface SignedUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  /** Only present when the upload must be signed as authenticated-delivery; the browser must send this back as the `type` form field. */
  type?: CloudinaryDeliveryType;
  /** Where the browser POSTs the file. */
  uploadUrl: string;
}

export function createSignedUpload(
  kind: UploadKind,
  entityId: string,
  options: { slot?: number; resourceType?: CloudinaryResourceType; deliveryType?: CloudinaryDeliveryType } = {}
): SignedUpload {
  const { slot, resourceType = "image", deliveryType = "upload" } = options;
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = buildPublicId(kind, entityId, slot);

  const params: Record<string, string | number> = {
    // Same id every time for this entity, so a replacement overwrites rather
    // than accumulating orphans.
    public_id: publicId,
    timestamp,
    overwrite: "true",
    // Purge the CDN copy, otherwise the old photo keeps being served from the
    // same URL after a replacement.
    invalidate: "true",
  };
  // Only signed when non-default, so every existing (image/upload) caller's
  // canonical string — and therefore signature — is unchanged.
  if (deliveryType !== "upload") params.type = deliveryType;

  return {
    cloudName,
    apiKey,
    timestamp,
    signature: sign(params, apiSecret),
    publicId,
    type: deliveryType !== "upload" ? deliveryType : undefined,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
  };
}

/**
 * Confirms an asset really exists under the public_id we signed, and returns
 * its canonical URL.
 *
 * The browser reports back what it uploaded, and a client can lie. Rather than
 * trusting the URL it hands us, we ask Cloudinary directly — so a crafted
 * response cannot point a profile photo at an arbitrary address.
 */
export async function verifyAsset(
  publicId: string,
  resourceType: CloudinaryResourceType = "image",
  deliveryType: CloudinaryDeliveryType = "upload"
): Promise<{ url: string; bytes: number; format: string } | null> {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();

  // The Admin API takes HTTP Basic auth (key:secret) rather than a signature.
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/${deliveryType}/${encodeURIComponent(publicId)}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) return null;
  const data = (await res.json()) as { secure_url?: string; bytes?: number; format?: string };
  return data.secure_url
    ? { url: data.secure_url, bytes: data.bytes ?? 0, format: data.format ?? "" }
    : null;
}

/** Remove an asset entirely — used when a photo is cleared, not replaced. */
export async function destroyAsset(
  publicId: string,
  resourceType: CloudinaryResourceType = "image",
  deliveryType: CloudinaryDeliveryType = "upload"
): Promise<void> {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const params: Record<string, string | number> = { public_id: publicId, timestamp, invalidate: "true" };
  if (deliveryType !== "upload") params.type = deliveryType;
  const signature = sign(params, apiSecret);

  await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
    method: "POST",
    body: new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      invalidate: "true",
      ...(deliveryType !== "upload" ? { type: deliveryType } : {}),
      api_key: apiKey,
      signature,
    }),
  });
}

/**
 * A delivery URL for an `authenticated`-type asset, signed so Cloudinary
 * will actually serve it — an authenticated asset with an unsigned URL
 * returns 401 regardless of who's asking, which is the real access-control
 * property "view-only" depends on: nobody downloads via a bare guessable
 * link, only via a route that has just checked canViewLibraryContent.
 *
 * This does NOT carry a Cloudinary-side time expiry — that needs the
 * separate "Auth Token" account feature (its own signing key configured in
 * the Cloudinary console, not the api_secret used here), which this
 * environment has no credentials to set up or verify. What this gives
 * instead: the URL is only ever handed out by our own API route, which
 * re-checks the caller's permission on every request — so access dies the
 * moment a session or permission is revoked, rather than on a fixed timer.
 * Enabling Auth Token later would add a true expiring signature on top of
 * this without changing the caller-facing shape.
 *
 * NOT verified against a live Cloudinary account (none is configured in
 * this environment) — confirm against a real sandbox cloud before relying
 * on it, in particular whether a transformation flag (fl_attachment, in
 * authenticatedDownloadUrl below) needs to be folded into the signed string
 * as well as the path.
 */
export function authenticatedDeliveryUrl(
  publicId: string,
  resourceType: CloudinaryResourceType,
  format?: string
): string {
  const { cloudName, apiSecret } = getCloudinaryConfig();
  const toSign: Record<string, string | number> = { public_id: publicId };
  const signature = sign(toSign, apiSecret).slice(0, 32);
  const path = format ? `${publicId}.${format}` : publicId;
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/authenticated/s--${signature}--/${path}`;
}

/**
 * Forces a browser download instead of inline rendering — the one place
 * Library content is allowed a real download link (past_paper only).
 */
export function authenticatedDownloadUrl(
  publicId: string,
  resourceType: CloudinaryResourceType,
  format?: string
): string {
  const { cloudName, apiSecret } = getCloudinaryConfig();
  const toSign: Record<string, string | number> = { public_id: publicId };
  const signature = sign(toSign, apiSecret).slice(0, 32);
  const path = format ? `${publicId}.${format}` : publicId;
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/authenticated/fl_attachment/s--${signature}--/${path}`;
}

/**
 * A square, face-cropped, auto-format delivery URL.
 *
 * Built from the public_id rather than stored, so changing how photos are
 * displayed never requires rewriting rows.
 */
export function avatarUrl(publicId: string | null, size = 96): string | null {
  if (!publicId) return null;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return null;
  return `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,g_face,w_${size},h_${size},q_auto,f_auto/${publicId}`;
}
