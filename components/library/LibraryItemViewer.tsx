'use client';

import { VideoViewer } from '@/components/library/viewers/VideoViewer';
import { AudioViewer } from '@/components/library/viewers/AudioViewer';
import { DocumentViewer } from '@/components/library/viewers/DocumentViewer';
import { PdfPageViewer } from '@/components/library/viewers/PdfPageViewer';
import { PdfLightboxViewer } from '@/components/library/viewers/PdfLightboxViewer';

export interface ViewableLibraryItem {
  title: string;
  contentType: 'video' | 'document' | 'notes' | 'support_file' | 'audiobook' | 'past_paper' | 'presentation';
  fileFormat: string | null;
  streamUrl: string | null;
  /** Present only for PDF-format content, stored as a Cloudinary `image` resource and delivered page-by-page. */
  pageImageUrls: string[] | null;
}

/**
 * Dispatches to the right in-app viewer — shared by the browse detail view
 * and the super-admin approval queue's preview. Routed off pageImageUrls
 * (not contentType): `document`/`notes`/`support_file`/`presentation` can
 * each be either a PDF (page-images) or doc/docx/zip (raw), so the actual
 * stored format decides the viewer, not the content-type label.
 *
 * `pdfViewer` picks between the plain inline carousel (the super-admin
 * review page — already a full page, not a popup, so a self-contained
 * lightbox would be redundant chrome) and the real zoom/swipe/thumbnail
 * lightbox (the consumer-facing LibraryFullScreenViewer, which IS meant to
 * feel like a real reader).
 */
export function LibraryItemViewer({
  item,
  pdfViewer = 'inline',
  onClose,
}: {
  item: ViewableLibraryItem;
  pdfViewer?: 'inline' | 'lightbox';
  /** Only meaningful for the lightbox: it owns Escape, so it needs a way out. */
  onClose?: () => void;
}) {
  if (item.pageImageUrls) {
    return pdfViewer === 'lightbox' ? (
      <PdfLightboxViewer pageImageUrls={item.pageImageUrls} onClose={onClose} />
    ) : (
      <PdfPageViewer pageImageUrls={item.pageImageUrls} />
    );
  }
  if (item.contentType === 'video') return <VideoViewer src={item.streamUrl ?? ''} />;
  if (item.contentType === 'audiobook') return <AudioViewer src={item.streamUrl ?? ''} title={item.title} />;
  return <DocumentViewer src={item.streamUrl ?? ''} format={item.fileFormat ?? ''} />;
}
