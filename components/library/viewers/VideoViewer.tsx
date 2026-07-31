'use client';

/**
 * No `download` attribute and not wrapped in an anchor — the URL itself is
 * still technically visible in devtools (a real browser limitation, not
 * something this component can close), but there is no click-to-download
 * affordance anywhere in this UI. See lib/cloudinary.ts's
 * libraryDeliveryUrl for the access-control side of "view-only" — the URL
 * is only ever handed out by our own permission-checked API route.
 */
export function VideoViewer({ src }: { src: string }) {
  return (
    <video
      controls
      controlsList="nodownload"
      onContextMenu={(e) => e.preventDefault()}
      className="w-full rounded-xl bg-black aspect-video"
    >
      <source src={src} />
      Your browser cannot play this video.
    </video>
  );
}
