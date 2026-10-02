'use client';

import { useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { BookOpen, CloudDownload, ListChecks, Search, SearchX, Sparkles, WifiOff, X } from 'lucide-react';
import { CATEGORIES, inCategory } from '@/components/library/public/libraryMeta';
import { PublicItemCard, PublicItemCardSkeleton } from '@/components/library/public/PublicItemCard';
import { usePublicLibrary, type PublicItem } from '@/components/library/public/usePublicLibrary';

type Sort = 'newest' | 'title';

function matches(item: PublicItem, needle: string) {
  if (!needle) return true;
  return [item.title, item.description, item.learningArea, item.authorName]
    .filter(Boolean)
    .some((field) => field!.toLowerCase().includes(needle));
}

/**
 * The public Library's front page. Search, category and subject live in the
 * URL (?q=&type=&subject=&sort=), so a filtered view can be shared or
 * bookmarked. Written with history.replaceState, which Next keeps in step
 * with useSearchParams, rather than router.replace: that would ask the
 * server for the page again on every keystroke, and fail over to a full
 * reload when offline.
 */
export function PublicLibraryHome() {
  const { items, savedIds, offline, loading, error } = usePublicLibrary();
  const pathname = usePathname();
  const params = useSearchParams();

  const q = params.get('q') ?? '';
  const category = params.get('type') ?? 'all';
  const subject = params.get('subject') ?? '';
  const sort: Sort = params.get('sort') === 'title' ? 'title' : 'newest';

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
  }

  const subjects = useMemo(
    () => [...new Set(items.map((i) => i.learningArea).filter((s): s is string => Boolean(s)))].sort(),
    [items]
  );

  const categories = useMemo(
    () =>
      CATEGORIES.map((c) => ({ ...c, count: items.filter((i) => inCategory(i.contentType, c.key)).length })).filter(
        (c) => c.key === 'all' || c.count > 0
      ),
    [items]
  );

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = items.filter(
      (i) => inCategory(i.contentType, category) && (!subject || i.learningArea === subject) && matches(i, needle)
    );
    return sort === 'title'
      ? [...list].sort((a, b) => a.title.localeCompare(b.title))
      : [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [items, q, category, subject, sort]);

  const filtering = Boolean(q || subject || category !== 'all');
  const clearAll = () => window.history.replaceState(null, '', pathname);

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary-50 to-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-100/70 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-accent-light blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center">
          <div>
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-700 shadow-sm ring-1 ring-primary-100">
            <BookOpen className="h-3.5 w-3.5" aria-hidden /> Free for every learner
          </p>
          <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight text-text-primary sm:text-5xl">
            Learn anything, anywhere — even offline.
          </h1>
          <p className="mt-4 max-w-xl text-base text-text-secondary sm:text-lg">
            Notes, video lessons, past papers and practice quizzes from TERECO teachers. Save what you need and keep
            learning without internet.
          </p>

          <form
            role="search"
            onSubmit={(e) => e.preventDefault()}
            className="mt-8 flex max-w-2xl items-center gap-2 rounded-2xl border border-border-strong bg-white p-2 shadow-[0_8px_30px_-12px_rgba(2,70,91,0.2)] focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-100"
          >
            <Search className="ml-2 h-5 w-5 shrink-0 text-text-faint" aria-hidden />
            <label htmlFor="library-search" className="sr-only">
              Search the library
            </label>
            <input
              id="library-search"
              type="search"
              value={q}
              onChange={(e) => setParam('q', e.target.value)}
              placeholder="Search by topic, subject or teacher"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-text-primary placeholder:text-text-faint focus:outline-none"
            />
            {q && (
              <button
                type="button"
                onClick={() => setParam('q', '')}
                className="rounded-lg p-2 text-text-muted hover:bg-bg-muted hover:text-text-primary"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </form>

          {!loading && items.length > 0 && (
            <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-muted">
              <div className="flex gap-1.5">
                <dt className="sr-only">Resources</dt>
                <dd>
                  <span className="font-bold text-text-primary">{items.length}</span> resource{items.length === 1 ? '' : 's'}
                </dd>
              </div>
              {subjects.length > 0 && (
                <div className="flex gap-1.5">
                  <dt className="sr-only">Subjects</dt>
                  <dd>
                    <span className="font-bold text-text-primary">{subjects.length}</span> subject
                    {subjects.length === 1 ? '' : 's'}
                  </dd>
                </div>
              )}
              {savedIds.size > 0 && (
                <div className="flex gap-1.5">
                  <dt className="sr-only">Saved</dt>
                  <dd>
                    <span className="font-bold text-text-primary">{savedIds.size}</span> saved on this device
                  </dd>
                </div>
              )}
            </dl>
          )}
          </div>

          <ul className="hidden space-y-3 lg:block" aria-label="Why TERECO Library">
            {[
              { icon: Sparkles, title: 'Free, no account needed', body: 'Open any item straight away.' },
              { icon: CloudDownload, title: 'Works offline', body: 'Save items and read them without internet.' },
              { icon: ListChecks, title: 'Practice quizzes', body: 'Check what you learned, marked instantly.' },
            ].map(({ icon: FeatureIcon, title, body }) => (
              <li
                key={title}
                className="flex items-start gap-3 rounded-2xl border border-white bg-white/80 p-4 shadow-[0_8px_24px_-16px_rgba(2,70,91,0.35)] backdrop-blur"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                  <FeatureIcon className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-text-primary">{title}</span>
                  <span className="block text-sm text-text-muted">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {offline && (
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
        )}

        {/* ── Category shelf + filters (nothing to filter in an empty library) ── */}
        {items.length > 0 && (
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
              role="tablist"
              aria-label="Categories"
            >
              {categories.map((c) => {
                const selected = c.key === category;
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setParam('type', c.key === 'all' ? '' : c.key)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                      selected
                        ? 'border-primary-700 bg-primary-700 text-white shadow-sm'
                        : 'border-border bg-white text-text-secondary hover:border-primary-200 hover:text-primary-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {c.label}
                    <span className={`text-xs ${selected ? 'text-white/75' : 'text-text-faint'}`}>{c.count}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              {subjects.length > 1 && (
                <select
                  value={subject}
                  onChange={(e) => setParam('subject', e.target.value)}
                  aria-label="Subject"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-white px-3 text-sm text-text-secondary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 lg:flex-none"
                >
                  <option value="">All subjects</option>
                  {subjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={sort}
                onChange={(e) => setParam('sort', e.target.value === 'newest' ? '' : e.target.value)}
                aria-label="Sort"
                className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-text-secondary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
              >
                <option value="newest">Newest first</option>
                <option value="title">A – Z</option>
              </select>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {loading ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <PublicItemCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            title="The library didn't load"
            body="Check your connection and try again."
            action={{ label: 'Try again', onClick: () => window.location.reload() }}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title={offline ? 'Nothing saved on this device yet' : 'The library is being stocked'}
            body={
              offline
                ? 'When you are online, open any item and tap “Save for offline” to read it here without internet.'
                : 'New notes, videos and past papers will appear here soon.'
            }
          />
        ) : results.length === 0 ? (
          <EmptyState
            title="No matches"
            body={q ? `Nothing matches “${q}”. Try a different word, or clear the filters.` : 'Nothing matches these filters.'}
            action={{ label: 'Clear filters', onClick: clearAll }}
          />
        ) : (
          <>
            {filtering && (
              <p className="mb-4 text-sm text-text-muted" aria-live="polite">
                {results.length} result{results.length === 1 ? '' : 's'}
                <button type="button" onClick={clearAll} className="ml-3 font-medium text-primary-700 hover:underline">
                  Clear filters
                </button>
              </p>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {results.map((item) => (
                <PublicItemCard key={item.id} item={item} saved={savedIds.has(item.id)} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong bg-bg-subtle px-6 py-16 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <SearchX className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-text-muted">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:border-primary-200"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
