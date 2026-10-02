'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { BookOpen, CloudDownload, ListChecks, Sparkles, WifiOff } from 'lucide-react';
import {
  HeroFeatures,
  LibraryHero,
  LibraryShelf,
  subjectsOf,
  type ShelfFilters,
} from '@/components/library/public/LibraryShelfView';
import { usePublicLibrary } from '@/components/library/public/usePublicLibrary';

const PARAM: Record<keyof ShelfFilters, string> = { q: 'q', category: 'type', subject: 'subject', sort: 'sort' };
const DEFAULT: Record<keyof ShelfFilters, string> = { q: '', category: 'all', subject: '', sort: 'newest' };

/**
 * The public Library's front page on the web. Search, category and subject
 * live in the URL (?q=&type=&subject=&sort=), so a filtered view can be shared
 * or bookmarked. Written with history.replaceState, which Next keeps in step
 * with useSearchParams, rather than router.replace: that would ask the server
 * for the page again on every keystroke, and fail over to a full reload when
 * offline. The look itself is LibraryHero + LibraryShelf, shared with the
 * desktop app.
 */
export function PublicLibraryHome() {
  const { items, savedIds, offline, loading, error } = usePublicLibrary();
  const pathname = usePathname();
  const params = useSearchParams();

  const filters: ShelfFilters = {
    q: params.get(PARAM.q) ?? '',
    category: params.get(PARAM.category) ?? 'all',
    subject: params.get(PARAM.subject) ?? '',
    sort: params.get(PARAM.sort) === 'title' ? 'title' : 'newest',
  };

  function setFilter(key: keyof ShelfFilters, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== DEFAULT[key]) next.set(PARAM[key], value);
    else next.delete(PARAM[key]);
    const query = next.toString();
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
  }
  const clearAll = () => window.history.replaceState(null, '', pathname);

  const subjects = subjectsOf(items);
  const stats =
    loading || items.length === 0
      ? []
      : [
          { value: items.length, label: items.length === 1 ? 'resource' : 'resources' },
          ...(subjects.length ? [{ value: subjects.length, label: subjects.length === 1 ? 'subject' : 'subjects' }] : []),
          ...(savedIds.size ? [{ value: savedIds.size, label: 'saved on this device' }] : []),
        ];

  return (
    <>
      <LibraryHero
        eyebrow={
          <>
            <BookOpen className="h-3.5 w-3.5" aria-hidden /> Free for every learner
          </>
        }
        title="Learn anything, anywhere — even offline."
        subtitle="Notes, video lessons, past papers and practice quizzes from TERECO teachers. Save what you need and keep learning without internet."
        q={filters.q}
        onSearch={(q) => setFilter('q', q)}
        stats={stats}
        aside={
          <HeroFeatures
            features={[
              { icon: Sparkles, title: 'Free, no account needed', body: 'Open any item straight away.' },
              { icon: CloudDownload, title: 'Works offline', body: 'Save items and read them without internet.' },
              { icon: ListChecks, title: 'Practice quizzes', body: 'Check what you learned, marked instantly.' },
            ]}
          />
        }
      />
      <LibraryShelf
        items={items}
        loading={loading}
        error={
          error
            ? {
                title: "The library didn't load",
                body: 'Check your connection and try again.',
                action: { label: 'Try again', onClick: () => window.location.reload() },
              }
            : null
        }
        empty={
          offline
            ? {
                title: 'Nothing saved on this device yet',
                body: 'When you are online, open any item and tap “Save for offline” to read it here without internet.',
              }
            : { title: 'The library is being stocked', body: 'New notes, videos and past papers will appear here soon.' }
        }
        filters={filters}
        onFilter={setFilter}
        onClear={clearAll}
        savedIds={savedIds}
        banner={
          offline && (
            <p
              role="status"
              className="mb-6 flex items-center gap-3 rounded-2xl border border-accent bg-accent-lighter px-4 py-3 text-sm text-text-secondary"
            >
              <WifiOff className="h-5 w-5 shrink-0 text-accent-dark" aria-hidden />
              <span>
                <strong className="font-semibold text-text-primary">You&apos;re offline.</strong>{' '}
                Showing what&apos;s saved on this device.
              </span>
            </p>
          )
        }
      />
    </>
  );
}
