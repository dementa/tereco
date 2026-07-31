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
): Promise<{ url: string; bytes: number; format: string; pages: number | null } | null> {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();

  // The Admin API takes HTTP Basic auth (key:secret) rather than a signature.
  // `pages=true` is opt-in — confirmed live that without it, the response
  // omits `pages` entirely even for a genuinely multi-page PDF (the upload
  // response includes it unprompted, but that's client-reported and this
  // function exists specifically to not trust that).
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/${deliveryType}/${encodeURIComponent(publicId)}?pages=true`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    // Cloudinary's error body (e.g. "Resource not found", "Invalid
    // signature") is the one piece of evidence that actually tells us why
    // verification failed — swallowing it here is why this failure mode was
    // undiagnosable from the outside. Logged, never thrown: a failed verify
    // is a normal "the upload didn't take" outcome for the caller, not a
    // server error.
    const body = await res.text().catch(() => "");
    console.error(
      `Cloudinary verifyAsset failed: ${res.status} ${res.statusText} — GET /resources/${resourceType}/${deliveryType}/${publicId} — ${body}`
    );
    return null;
  }
  const data = (await res.json()) as { secure_url?: string; bytes?: number; format?: string; pages?: number };
  return data.secure_url
    ? { url: data.secure_url, bytes: data.bytes ?? 0, format: data.format ?? "", pages: data.pages ?? null }
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
 * A Library delivery URL. Verified live against a real Cloudinary account
 * (2026-07-31) that `type=authenticated` cannot be served at all without
 * Cloudinary's separate "Auth Token" account feature (its own signing key
 * configured in the console, not api_secret) — even Cloudinary's OWN
 * returned `secure_url` for an authenticated asset 401'd on fetch. So
 * Library uses plain `type=upload`, the same delivery type profile/school
 * photos already use — the real access-control property is that this URL
 * is only ever handed out by our own API route after it re-checks
 * canViewLibraryContent/canProfileViewLibraryContent, not a Cloudinary-side
 * lock. Anyone who already has the exact URL (a random UUID-keyed path) can
 * fetch it directly; that is the same guarantee this app's existing
 * profile-photo delivery already relies on.
 *
 * `format` is only appended for image/video: raw resources bake the
 * extension into the stored public_id itself (confirmed live — signing
 * "…/<uuid>" for a raw upload comes back stored as "…/<uuid>.pdf"), so
 * `cloudinary_public_id` for a raw item already includes it and appending
 * again would double it ("…pdf.pdf", a confirmed 401).
 */
export function libraryDeliveryUrl(
  publicId: string,
  resourceType: CloudinaryResourceType,
  format?: string,
  options: { download?: boolean } = {}
): string {
  const { cloudName } = getCloudinaryConfig();
  const path = resourceType !== "raw" && format ? `${publicId}.${format}` : publicId;
  const transform = options.download ? "fl_attachment/" : "";
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${transform}${path}`;
}

/**
 * One page of a PDF, delivered as a JPG — NOT libraryDeliveryUrl, because
 * PDF-format Library uploads are stored as Cloudinary `image` resources
 * specifically so the `pg_N,f_jpg` transformation applies. Requesting the
 * original (untransformed) format from the same resource still 401s —
 * confirmed live, 2026-07-31 — so this function only ever asks for a JPG
 * conversion, never the source bytes.
 */
export function libraryPdfPageImageUrl(publicId: string, page: number): string {
  const { cloudName } = getCloudinaryConfig();
  return `https://res.cloudinary.com/${cloudName}/image/upload/pg_${page},f_jpg,q_auto/${publicId}`;
}

const THUMBNAIL_TRANSFORM = "w_320,h_220,c_fill,q_auto";

/** Page 1 of a PDF-as-image asset, cropped to a small thumbnail size for card grids. */
export function libraryPdfThumbnailUrl(publicId: string): string {
  const { cloudName } = getCloudinaryConfig();
  return `https://res.cloudinary.com/${cloudName}/image/upload/pg_1,f_jpg,${THUMBNAIL_TRANSFORM}/${publicId}`;
}

/**
 * A frame from a video, as a small JPG thumbnail (`so_0` = the frame at 0
 * seconds). Standard Cloudinary video functionality — one of their most
 * basic transformations, unlike the PDF-as-image workaround and the
 * authenticated-delivery dead end earlier in this file, both of which
 * turned out to need live verification before shipping. NOT verified live
 * in this environment (no way to synthesize a real video file here without
 * ffmpeg) — if thumbnails don't render for video uploads, this is the first
 * place to check.
 */
export function libraryVideoThumbnailUrl(publicId: string): string {
  const { cloudName } = getCloudinaryConfig();
  return `https://res.cloudinary.com/${cloudName}/video/upload/so_0,f_jpg,${THUMBNAIL_TRANSFORM}/${publicId}`;
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
