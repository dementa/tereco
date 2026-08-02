'use client';

import { DocxViewer } from '@/components/library/viewers/DocxViewer';

const OFFICE_EMBED_FORMATS = new Set(['doc', 'ppt', 'pptx', 'xls', 'xlsx']);

/**
 * pdf never reaches this component — LibraryItemViewer routes it to
 * PdfLightboxViewer/PdfPageViewer instead (this account blocks raw PDF
 * delivery outright, so pdf is always stored as Cloudinary `image` pages).
 *
 * docx renders as real formatted HTML via DocxViewer/mammoth.js — no
 * iframe, no third party — since .docx delivery is NOT subject to the same
 * restriction as pdf/zip (verified live, 2026-07-31). Legacy doc/ppt/pptx/
 * xls/xlsx (binary formats mammoth can't parse) still go through
 * Microsoft's public embed viewer, a real limitation for those specific
 * formats: the signed delivery URL is fetched by Microsoft's servers, not
 * ours, so it's visible in the embed's own markup. zip has no in-browser
 * preview at all — it's inherently something you extract, not view — so it
 * shows a plain notice rather than pretending a preview exists.
 */
export function DocumentViewer({ src, format }: { src: string; format: string }) {
  const normalized = format.toLowerCase();

  if (normalized === 'docx') {
    return <DocxViewer src={src} />;
  }

  if (OFFICE_EMBED_FORMATS.has(normalized)) {
    const embedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(src)}`;
    return <iframe src={embedUrl} className="w-full h-[70vh] rounded-xl border border-border" title="Document preview" />;
  }

  return (
    <div className="rounded-xl bg-bg-muted p-6 text-center">
      <p className="text-sm text-text-muted">This file type ({normalized || 'unknown'}) can&apos;t be previewed in-app.</p>
    </div>
  );
}
