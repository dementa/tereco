'use client';

import { LibraryThumbnail, type LibraryThumbnailItem } from '@/components/library/LibraryThumbnail';
import { Download } from 'lucide-react';

export interface LibraryBookCardItem extends LibraryThumbnailItem {
  title: string;
  description: string;
  authorName: string;
  createdAt: string;
  downloadAvailable: boolean;
}

/** "2 days ago" / "3 hours ago" — spelled out, matching the card mockup. */
function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const units: [number, string][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [30, 'day'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];
  let value = seconds;
  for (const [size, name] of units) {
    if (value < size) {
      const rounded = Math.floor(value);
      return rounded <= 0 ? 'just now' : `${rounded} ${name}${rounded === 1 ? '' : 's'} ago`;
    }
    value = value / size;
  }
  return 'just now';
}

/** First letters of the first two words — the avatar fallback (profiles carry no photo). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * The library "book" card: a cover image above a teal gradient panel carrying
 * the title, a one-line description, and an uploader byline with a relative
 * timestamp. Modelled on the supplied design (Sample data/book card.png).
 *
 * Cover shape follows the content. A video's thumbnail is a frame from the
 * video, which is 16:9 — forcing it into a portrait book cover cropped the
 * sides off and made the card as tall as a book for no reason.
 */
export function LibraryBookCard({ item }: { item: LibraryBookCardItem }) {
  const coverAspect = item.contentType === 'video' ? 'aspect-video' : 'aspect-[4/5]';

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-xl bg-[#02465B] shadow-md ring-1 ring-black/5 transition-shadow hover:shadow-xl">
      <div className="relative overflow-hidden">
        <div className="transition-transform duration-300 group-hover:scale-[1.03]">
          <LibraryThumbnail item={item} aspectClassName={coverAspect} />
        </div>
        {item.downloadAvailable && (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <Download className="h-3 w-3" aria-hidden /> Download
          </span>
        )}
      </div>

      {/* The byline is one line, not two: the "Author" caption under the name
          was a whole row of height explaining what an avatar and a name next to
          a timestamp already say. */}
      <div className="flex flex-1 flex-col bg-gradient-to-b from-[#0B6C7E] to-[#02465B] px-2.5 py-2 text-white">
        <h3 className="truncate text-sm font-bold leading-tight">{item.title}</h3>
        <p className="mt-0.5 truncate text-xs text-white/70">
          {item.description?.trim() || 'No description provided.'}
        </p>

        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-[9px] font-semibold text-white ring-1 ring-white/25"
            aria-hidden
          >
            {initials(item.authorName)}
          </span>
          <p className="min-w-0 truncate text-[11px] font-medium leading-tight">
            {item.authorName || 'Unknown'}
          </p>
          <span className="ml-auto shrink-0 text-[10px] text-white/55">{timeAgo(item.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
