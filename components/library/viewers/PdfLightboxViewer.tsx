'use client';

import { useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';

/**
 * A real reader for PDF-as-page-images: pinch/scroll zoom, swipe between
 * pages, a thumbnail strip, fullscreen — replaces the bare prev/next
 * carousel (components/library/viewers/PdfPageViewer.tsx, still used as-is
 * on the super-admin review page, which isn't a popup and didn't need this).
 * Still page-images under the hood (Cloudinary won't serve raw PDF bytes on
 * this account), but the reading experience no longer looks like one.
 */
export function PdfLightboxViewer({ pageImageUrls }: { pageImageUrls: string[] }) {
  const [index, setIndex] = useState(0);

  return (
    <Lightbox
      open
      close={() => {}}
      index={index}
      on={{ view: ({ index: i }) => setIndex(i) }}
      slides={pageImageUrls.map((src) => ({ src }))}
      plugins={[Zoom, Thumbnails]}
      controller={{ closeOnBackdropClick: false, closeOnPullDown: false }}
      // No render.buttonClose — the surrounding LibraryFullScreenViewer owns
      // "close," so the lightbox doesn't need its own competing X button.
      render={{ buttonClose: () => null }}
      styles={{ root: { position: 'absolute', inset: 0 } }}
      carousel={{ finite: true }}
    />
  );
}
