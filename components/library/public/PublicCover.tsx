'use client';

import { useState } from 'react';
import type { LibraryContentTypeValue } from '@/components/library/LibraryThumbnail';
import { TYPE_META } from '@/components/library/public/libraryMeta';

/** A designed stand-in per type, for items Cloudinary has no preview image for (audio, docx, slides…). */
const TONE: Record<LibraryContentTypeValue, { bg: string; tile: string; icon: string }> = {
  notes: { bg: 'from-primary-50 to-primary-100', tile: 'bg-white', icon: 'text-primary-700' },
  document: { bg: 'from-primary-50 to-primary-100', tile: 'bg-white', icon: 'text-primary-700' },
  video: { bg: 'from-primary-700 to-primary-500', tile: 'bg-white/15 ring-1 ring-white/25', icon: 'text-white' },
  audiobook: { bg: 'from-accent-light to-accent', tile: 'bg-white', icon: 'text-accent-dark' },
  past_paper: { bg: 'from-accent-lighter to-accent-light', tile: 'bg-white', icon: 'text-accent-dark' },
  presentation: { bg: 'from-primary-100 to-primary-200', tile: 'bg-white', icon: 'text-primary-800' },
  support_file: { bg: 'from-bg-subtle to-bg-muted', tile: 'bg-white', icon: 'text-text-secondary' },
};

/**
 * The cover of a public Library item: its preview image (a PDF's first page,
 * a video frame), or a type-coloured cover when there is none or it fails to
 * load. `className` sets the shape.
 */
export function PublicCover({
  item,
  className = 'aspect-[4/3]',
  large = false,
}: {
  item: { contentType: LibraryContentTypeValue; thumbnailUrl: string | null; fileFormat: string | null };
  className?: string;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (item.thumbnailUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted, arbitrary remote host
      <img
        src={item.thumbnailUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`w-full object-cover bg-bg-muted ${className}`}
      />
    );
  }

  const tone = TONE[item.contentType];
  const Icon = TYPE_META[item.contentType].icon;
  return (
    <div className={`flex w-full flex-col items-center justify-center gap-2 bg-gradient-to-br ${tone.bg} ${className}`}>
      <span
        className={`flex items-center justify-center rounded-2xl shadow-sm ${tone.tile} ${large ? 'h-20 w-20' : 'h-12 w-12 sm:h-14 sm:w-14'}`}
      >
        <Icon className={`${tone.icon} ${large ? 'h-10 w-10' : 'h-6 w-6 sm:h-7 sm:w-7'}`} aria-hidden />
      </span>
      {item.fileFormat && large && (
        <span className={`text-xs font-bold tracking-widest ${item.contentType === 'video' ? 'text-white/80' : 'text-text-muted'}`}>
          {item.fileFormat.toUpperCase()}
        </span>
      )}
    </div>
  );
}
