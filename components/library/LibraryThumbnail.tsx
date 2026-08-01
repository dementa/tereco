'use client';

import { useState } from 'react';
import { FileText, Video, Headphones, Presentation } from 'lucide-react';

export type LibraryContentTypeValue =
  | 'video'
  | 'document'
  | 'notes'
  | 'support_file'
  | 'audiobook'
  | 'past_paper'
  | 'presentation';

export interface LibraryThumbnailItem {
  contentType: LibraryContentTypeValue;
  thumbnailUrl: string | null;
}

const TYPE_ICON: Record<LibraryContentTypeValue, React.ElementType> = {
  video: Video,
  document: FileText,
  notes: FileText,
  support_file: FileText,
  audiobook: Headphones,
  past_paper: FileText,
  presentation: Presentation,
};

/**
 * Page 1 of a PDF, or a video's opening frame, cropped to a fixed box — or
 * a plain content-type icon for whatever has neither (audiobook, and raw
 * doc/docx/xls/xlsx/zip, none of which Cloudinary can generate a preview
 * image for). `onError` falls back to the icon too, in case a thumbnail URL
 * exists but the underlying asset doesn't load for some reason.
 */
export function LibraryThumbnail({
  item,
  aspectClassName = 'aspect-[16/11]',
}: {
  item: LibraryThumbnailItem;
  /** Cover shape. Defaults to landscape; the browse cards pass a portrait ratio. */
  aspectClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = TYPE_ICON[item.contentType];

  if (!item.thumbnailUrl || failed) {
    return (
      <div className={`w-full ${aspectClassName} bg-bg-muted flex items-center justify-center`}>
        <Icon className="w-8 h-8 text-primary-700" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted, arbitrary remote host
    <img
      src={item.thumbnailUrl}
      alt=""
      onError={() => setFailed(true)}
      className={`w-full ${aspectClassName} object-cover bg-bg-muted`}
    />
  );
}
