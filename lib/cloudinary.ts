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

export type UploadKind = "profile" | "school" | "question" | "script";

const FOLDERS: Record<UploadKind, string> = {
  profile: "tereco/profiles",
  school: "tereco/schools",
  question: "tereco/questions",
  // One folder per submission, one asset per page.
  script: "tereco/scripts",
};

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
  /** Where the browser POSTs the file. */
  uploadUrl: string;
}

export function createSignedUpload(
  kind: UploadKind,
  entityId: string,
  slot?: number
): SignedUpload {
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

  return {
    cloudName,
    apiKey,
    timestamp,
    signature: sign(params, apiSecret),
    publicId,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
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
export async function verifyAsset(publicId: string): Promise<{ url: string } | null> {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();

  // The Admin API takes HTTP Basic auth (key:secret) rather than a signature.
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload/${encodeURIComponent(publicId)}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) return null;
  const data = (await res.json()) as { secure_url?: string };
  return data.secure_url ? { url: data.secure_url } : null;
}

/** Remove an asset entirely — used when a photo is cleared, not replaced. */
export async function destroyAsset(publicId: string): Promise<void> {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign({ public_id: publicId, timestamp, invalidate: "true" }, apiSecret);

  await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body: new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      invalidate: "true",
      api_key: apiKey,
      signature,
    }),
  });
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
