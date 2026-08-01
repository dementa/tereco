'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface PdfPreviewModalProps {
  open: boolean;
  onClose: () => void;
  /** The PDF endpoint to fetch. Null while nothing is being previewed. */
  url: string | null;
  /** Filename offered when the user chooses to download. */
  filename: string;
  title: React.ReactNode;
}

/**
 * Shows a generated PDF inline before the user commits to downloading it.
 *
 * The PDF routes send `Content-Disposition: attachment`, so pointing an
 * <iframe> straight at the URL would download rather than render. Fetching
 * the bytes and rendering a blob: URL sidesteps that — the same bytes then
 * back both the preview and the download, so what the user sees is exactly
 * what lands on disk, and the paper is only generated once.
 */
export function PdfPreviewModal({ open, onClose, url, filename, title }: PdfPreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !url) return;

    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBlobUrl(null);

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          // The PDF routes fail with a JSON { message } envelope.
          let message = 'Could not generate the preview.';
          try {
            const body = await res.json();
            if (body?.message) message = body.message;
          } catch {
            /* non-JSON body — keep the generic message */
          }
          if (!cancelled) setError(message);
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) setError('Could not reach the server to build the preview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] print:hidden" role="presentation">
          <motion.div
            className="absolute inset-0 bg-[#02465B]/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            aria-hidden
          />
          <div className="absolute inset-0 p-3 sm:p-6 flex items-center justify-center">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={typeof title === 'string' ? title : undefined}
              className="relative flex w-full max-w-4xl h-full max-h-[90vh] flex-col bg-white rounded-2xl border border-[#EAEAEA] shadow-xl overflow-hidden"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#EAEAEA] px-4 py-3 sm:px-5">
                <h2 className="min-w-0 truncate font-semibold text-primary-900">{title}</h2>
                <div className="flex shrink-0 items-center gap-2">
                  {blobUrl && (
                    <a href={blobUrl} download={filename}>
                      <Button variant="outline">
                        <Download className="w-4 h-4 mr-1.5" aria-hidden />
                        Download
                      </Button>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="p-1.5 rounded-lg hover:bg-[#FAFAFA]"
                  >
                    <X className="w-4 h-4 text-text-muted" aria-hidden />
                  </button>
                </div>
              </div>

              <div className="relative flex-1 bg-[#FAFAFA]">
                {loading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-muted">
                    <Loader2 className="w-6 h-6 animate-spin" aria-hidden />
                    <p className="text-sm">Building the preview…</p>
                  </div>
                )}
                {error && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
                    <p className="text-sm font-medium text-[#C26565]">{error}</p>
                    <p className="text-xs text-text-muted">Nothing was downloaded.</p>
                  </div>
                )}
                {blobUrl && (
                  <iframe
                    src={blobUrl}
                    title={typeof title === 'string' ? title : 'PDF preview'}
                    className="absolute inset-0 h-full w-full"
                  />
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
