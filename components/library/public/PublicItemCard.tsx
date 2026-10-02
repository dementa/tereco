'use client';

import Link from 'next/link';
import { CheckCircle2, Download, ListChecks, Star } from 'lucide-react';
import { PublicCover } from '@/components/library/public/PublicCover';
import { TYPE_META, sizeLabel } from '@/components/library/public/libraryMeta';
import type { LibraryContentTypeValue } from '@/components/library/LibraryThumbnail';

/**
 * What a card needs. The web's public items and TERECO Collect's offline
 * summaries both fit: fields only one of them has are optional.
 */
export interface CardItem {
  id: string;
  title: string;
  description: string;
  contentType: LibraryContentTypeValue;
  fileFormat: string | null;
  learningArea: string | null;
  authorName: string;
  thumbnailUrl: string | null;
  pageImageUrls?: string[] | null;
  downloadAvailable?: boolean;
  createdAt?: string;
  /** Desktop: published quizzes on this item. */
  quizCount?: number;
  /** Desktop: aimed at the signed-in learner rather than public. */
  personal?: boolean;
}

/**
 * A public Library card: a uniform 4:3 cover (so a row of mixed videos and
 * PDFs lines up), the type over the cover, then subject, title, and a byline.
 * On phones it lies flat — cover left, text right — so a list of twenty is a
 * scroll, not a marathon. The whole card is the link.
 */
export function PublicItemCard({ item, saved = false }: { item: CardItem; saved?: boolean }) {
  const meta = TYPE_META[item.contentType];
  const Icon = meta.icon;
  const size = sizeLabel(item);

  return (
    <Link
      href={`/library/${item.id}`}
      className="group flex h-full flex-row overflow-hidden rounded-2xl xs:flex-col border border-border bg-white transition duration-200 hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-[0_12px_32px_-12px_rgba(2,70,91,0.25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40"
    >
      <div className="relative w-28 shrink-0 overflow-hidden bg-primary-50 xs:w-auto">
        <div className="h-full transition-transform duration-300 group-hover:scale-[1.03]">
          <PublicCover item={item} className="h-full min-h-28 xs:h-auto xs:min-h-0 xs:aspect-[4/3]" />
        </div>
        <span className="absolute left-3 top-3 hidden items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-primary-700 shadow-sm xs:inline-flex">
          <Icon className="h-3.5 w-3.5" aria-hidden /> {meta.label}
        </span>
        {item.personal && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-[11px] font-semibold text-text-primary shadow-sm xs:right-3 xs:top-3">
            <Star className="h-3.5 w-3.5" aria-hidden /> <span className="sr-only xs:not-sr-only">For you</span>
          </span>
        )}
        {saved && !item.personal && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary-700 p-1 text-[11px] font-semibold text-white shadow-sm xs:right-3 xs:top-3 xs:px-2 xs:py-1">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> <span className="sr-only xs:not-sr-only">Saved</span>
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-3.5 xs:p-4">
        <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-primary-700 xs:hidden">
          <Icon className="h-3.5 w-3.5" aria-hidden /> {meta.label}
        </p>
        {item.learningArea && (
          <p className="mb-1 truncate text-[11px] font-semibold uppercase tracking-wider text-primary-600">
            {item.learningArea}
          </p>
        )}
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-text-primary group-hover:text-primary-700">
          {item.title}
        </h3>
        {item.description?.trim() && (
          <p className="mt-1.5 line-clamp-1 text-sm leading-relaxed text-text-muted xs:line-clamp-2">{item.description}</p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-3 text-xs text-text-muted xs:pt-4">
          <span className="min-w-0 truncate">{item.authorName || 'TERECO'}</span>
          {size && (
            <>
              <span aria-hidden className="text-text-faint">•</span>
              <span className="shrink-0">{size}</span>
            </>
          )}
          {!!item.quizCount && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-medium text-primary-700">
              <ListChecks className="h-3.5 w-3.5" aria-hidden /> {item.quizCount} quiz{item.quizCount === 1 ? '' : 'zes'}
            </span>
          )}
          {item.downloadAvailable && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-medium text-primary-700">
              <Download className="h-3.5 w-3.5" aria-hidden /> PDF
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Same footprint as a card, while the catalog loads. */
export function PublicItemCardSkeleton() {
  return (
    <div className="flex overflow-hidden rounded-2xl border border-border bg-white xs:block" aria-hidden>
      <div className="w-28 shrink-0 animate-pulse bg-bg-muted xs:aspect-[4/3] xs:w-auto" />
      <div className="flex-1 space-y-2.5 p-4">
        <div className="h-2.5 w-1/3 animate-pulse rounded bg-bg-muted" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-bg-muted" />
      </div>
    </div>
  );
}
