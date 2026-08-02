'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * PDF-format Library content is stored as Cloudinary `image` resources and
 * delivered as one JPG per page — this account blocks serving raw PDF bytes
 * outright (confirmed live), but page-to-JPG conversion isn't subject to
 * that restriction. One side effect worth keeping: no text-select/copy and
 * no native "save as PDF," which is arguably a better fit for "view-only"
 * than an embedded PDF reader would have been anyway.
 */
export function PdfPageViewer({ pageImageUrls }: { pageImageUrls: string[] }) {
  const [page, setPage] = useState(0);
  if (pageImageUrls.length === 0) return <p className="text-sm text-text-muted">This document has no pages to show.</p>;

  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted, dimensions vary per page */}
      <img
        src={pageImageUrls[page]}
        alt={`Page ${page + 1} of ${pageImageUrls.length}`}
        className="w-full rounded-xl border border-border"
        onContextMenu={(e) => e.preventDefault()}
      />
      {pageImageUrls.length > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-1.5 rounded-lg hover:bg-bg-muted disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <p className="text-sm text-text-muted">
            Page {page + 1} of {pageImageUrls.length}
          </p>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageImageUrls.length - 1, p + 1))}
            disabled={page === pageImageUrls.length - 1}
            className="p-1.5 rounded-lg hover:bg-bg-muted disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
