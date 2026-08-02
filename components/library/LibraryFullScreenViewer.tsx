'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, MessageSquare } from 'lucide-react';
import { LibraryItemViewer, type ViewableLibraryItem } from '@/components/library/LibraryItemViewer';
import { FeedbackForm } from '@/components/library/FeedbackForm';

export interface FullScreenLibraryItem extends ViewableLibraryItem {
  id: string;
  description: string;
  downloadable: boolean;
  downloadAvailable: boolean;
  downloadUrl: string | null;
}

/**
 * Replaces the old Modal popup: covers the entire viewport so opening a
 * document feels like opening a real reader, not a small dialog box.
 *
 * PDF content is a special case — PdfLightboxViewer (yet-another-react-
 * lightbox) owns its own full-viewport portal with its own zoom/swipe/
 * thumbnail chrome, so this component only overlays a floating close button
 * and a feedback toggle on top of it rather than wrapping it in a second
 * competing "chrome" layer. Every other content type (video/audio/docx/
 * office-embed/zip-notice) gets a proper top bar + content area, since
 * those have no chrome of their own.
 */
export function LibraryFullScreenViewer({ item, onClose }: { item: FullScreenLibraryItem; onClose: () => void }) {
  const [showFeedback, setShowFeedback] = useState(false);
  const isPdfPages = item.pageImageUrls !== null;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    // Capture phase, deliberately: the PDF lightbox binds onKeyDown:
    // stopPropagation on its own container, so a bubble-phase listener here
    // never sees Escape while a book is open. Capture runs first and cannot be
    // cancelled by a descendant.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  // z-100 for all viewer chrome, above the PDF lightbox root (90) and the
  // non-PDF backdrop (90). Nothing in the app's own chrome goes past z-50.
  const floatingButtons = (
    <div className="fixed top-4 right-4 z-[100] flex items-center gap-2">
      {item.downloadAvailable && item.downloadUrl && (
        <a href={item.downloadUrl} download>
          <button
            type="button"
            className="p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm"
            aria-label="Download"
          >
            <Download className="w-5 h-5" />
          </button>
        </a>
      )}
      <button
        type="button"
        onClick={() => setShowFeedback((v) => !v)}
        className="p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm"
        aria-label="Feedback"
      >
        <MessageSquare className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={onClose}
        className="p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  const feedbackDrawer = showFeedback && (
    <div className="fixed bottom-0 inset-x-0 z-[100] bg-white rounded-t-2xl border-t border-border p-4 sm:p-6 max-h-[40vh] overflow-y-auto shadow-2xl">
      <div className="max-w-xl mx-auto">
        <FeedbackForm contentId={item.id} />
      </div>
    </div>
  );

  if (isPdfPages) {
    return createPortal(
      <>
        <LibraryItemViewer item={item} pdfViewer="lightbox" onClose={onClose} />
        {floatingButtons}
        {feedbackDrawer}
      </>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/95 flex flex-col" role="dialog" aria-modal="true" aria-label={item.title}>
      <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 bg-black/40 shrink-0">
        <p className="font-medium text-white truncate">{item.title}</p>
      </div>
      {/* Clicking the letterboxing closes, the way every other lightbox behaves.
          cursor-pointer is load-bearing on iOS: React binds the click at the
          root container, so this div carries no inline onclick and Safari will
          not synthesize click events for it otherwise. */}
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        className="flex-1 min-h-0 cursor-pointer overflow-y-auto p-4 sm:p-8 flex items-start justify-center"
      >
        <div className="w-full max-w-3xl space-y-4 cursor-auto">
          {item.description && <p className="text-sm text-white/80">{item.description}</p>}
          <LibraryItemViewer item={item} />
          {!item.downloadAvailable && item.downloadable && (
            <p className="text-xs text-white/60">Download unavailable right now — ask your admin to check the storage configuration.</p>
          )}
        </div>
      </div>
      {floatingButtons}
      {feedbackDrawer}
    </div>,
    document.body
  );
}
