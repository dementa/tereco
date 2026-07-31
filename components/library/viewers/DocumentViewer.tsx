'use client';

const OFFICE_FORMATS = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']);

/**
 * pdf renders in the browser's native PDF viewer via a plain iframe. Office
 * formats (doc/docx/ppt/pptx/xls/xlsx) go through Microsoft's public embed
 * viewer, since browsers cannot render those natively — this means the
 * signed delivery URL is fetched by Microsoft's servers, not ours, which is
 * a real limitation of "view-only" for these formats (the URL is visible in
 * the embed's own markup). zip (support_file only) has no in-browser
 * preview at all — a zip is inherently something you extract, not view —
 * so it shows a plain notice rather than pretending a preview exists.
 */
export function DocumentViewer({ src, format }: { src: string; format: string }) {
  const normalized = format.toLowerCase();

  if (normalized === 'pdf') {
    return <iframe src={src} className="w-full h-[70vh] rounded-xl border border-primary-100" title="Document preview" />;
  }

  if (OFFICE_FORMATS.has(normalized)) {
    const embedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(src)}`;
    return <iframe src={embedUrl} className="w-full h-[70vh] rounded-xl border border-primary-100" title="Document preview" />;
  }

  return (
    <div className="rounded-xl bg-bg-muted p-6 text-center">
      <p className="text-sm text-text-muted">This file type ({normalized || 'unknown'}) can&apos;t be previewed in-app.</p>
    </div>
  );
}
