'use client';

import { useEffect, useState } from 'react';

/**
 * Renders an actual .docx file as clean, formatted HTML directly on the
 * page — no iframe, no third-party embed. Works because .docx delivery is
 * NOT subject to the same restriction as raw PDF/ZIP on this Cloudinary
 * account (verified live, 2026-07-31: an uploaded .docx fetches 200, unlike
 * .pdf's 401). Legacy .doc (the old binary format, not a zip-based OOXML
 * container) can't be parsed this way — that and ppt/pptx/xls/xlsx keep the
 * Office-online iframe fallback in DocumentViewer.
 */
export function DocxViewer({ src }: { src: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const mammoth = await import('mammoth');
        const res = await fetch(src);
        if (!res.ok) throw new Error('Could not load the document.');
        const arrayBuffer = await res.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setHtml(result.value);
      } catch {
        if (!cancelled) setError("This document couldn't be rendered.");
      }
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!html) return <p className="text-sm text-text-muted">Loading document…</p>;

  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      className="bg-white rounded-xl border border-border p-6 overflow-y-auto max-h-[75vh] text-sm text-text-primary leading-relaxed
        [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-primary-900 [&_h1]:mt-4 [&_h1]:mb-2
        [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-primary-900 [&_h2]:mt-4 [&_h2]:mb-2
        [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-primary-900 [&_h3]:mt-3 [&_h3]:mb-1.5
        [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-3
        [&_li]:mb-1 [&_strong]:font-semibold [&_em]:italic [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2"
    />
  );
}
