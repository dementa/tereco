'use client';

import { useMemo } from 'react';
import { Search, SearchX, X } from 'lucide-react';
import { CATEGORIES, inCategory } from '@/components/library/public/libraryMeta';
import { PublicItemCard, PublicItemCardSkeleton, type CardItem } from '@/components/library/public/PublicItemCard';

/**
 * The Library's front page, as pure presentation: the hero with its search,
 * and the shelf of category pills, filters and cards. Shared by the public
 * web Library (components/library/public/PublicLibraryHome.tsx) and TERECO
 * Collect's offline Library (desktop/renderer/src/Library.tsx), which feed it
 * from different places — an API and the browser's offline copy on the web,
 * the machine's own SQLite store on the desktop. Nothing here fetches, reads
 * the URL, or touches a web-only API, so both builds compile it unchanged.
 */

export interface ShelfFilters {
  q: string;
  category: string;
  subject: string;
  sort: 'newest' | 'title';
}

export const NO_FILTERS: ShelfFilters = { q: '', category: 'all', subject: '', sort: 'newest' };

export function LibraryHero({
  eyebrow,
  title,
  subtitle,
  q,
  onSearch,
  stats,
  aside,
  children,
}: {
  eyebrow: React.ReactNode;
  title: string;
  subtitle: string;
  q: string;
  onSearch: (q: string) => void;
  stats: { value: number; label: string }[];
  aside?: React.ReactNode;
  /** Under the stats — the desktop's sync line. */
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary-50 to-white">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-100/70 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-accent-light blur-3xl" />
      <div
        className={`relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 ${
          aside ? 'lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center' : ''
        }`}
      >
        <div>
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-700 shadow-sm ring-1 ring-primary-100">
            {eyebrow}
          </p>
          <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight text-text-primary sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-xl text-base text-text-secondary sm:text-lg">{subtitle}</p>

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
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search by topic, subject or teacher"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-text-primary placeholder:text-text-faint focus:outline-none"
            />
            {q && (
              <button
                type="button"
                onClick={() => onSearch('')}
                className="rounded-lg p-2 text-text-muted hover:bg-bg-muted hover:text-text-primary"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </form>

          {stats.length > 0 && (
            <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-muted">
              {stats.map((s) => (
                <div key={s.label} className="flex gap-1.5">
                  <dt className="sr-only">{s.label}</dt>
                  <dd>
                    <span className="font-bold text-text-primary">{s.value}</span> {s.label}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {children}
        </div>
        {aside}
      </div>
    </section>
  );
}

/** Feature tiles for the hero's side, on wide screens. */
export function HeroFeatures({ features }: { features: { icon: React.ElementType; title: string; body: string }[] }) {
  return (
    <ul className="hidden space-y-3 lg:block" aria-label="Features">
      {features.map(({ icon: FeatureIcon, title, body }) => (
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
  );
}

export function subjectsOf(items: CardItem[]): string[] {
  return [...new Set(items.map((i) => i.learningArea).filter((s): s is string => Boolean(s)))].sort();
}

function matches(item: CardItem, needle: string) {
  if (!needle) return true;
  return [item.title, item.description, item.learningArea, item.authorName]
    .filter(Boolean)
    .some((field) => field!.toLowerCase().includes(needle));
}

export interface EmptyStateProps {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}

export function LibraryShelf({
  items,
  loading,
  error,
  empty,
  filters,
  onFilter,
  onClear,
  savedIds,
  banner,
}: {
  items: CardItem[];
  loading: boolean;
  error?: EmptyStateProps | null;
  /** What to say when there is nothing at all (as opposed to nothing matching). */
  empty: EmptyStateProps;
  filters: ShelfFilters;
  onFilter: (key: keyof ShelfFilters, value: string) => void;
  onClear: () => void;
  savedIds?: Set<string>;
  banner?: React.ReactNode;
}) {
  const subjects = useMemo(() => subjectsOf(items), [items]);
  // "Newest first" needs a date; the desktop's offline copy has none, so it sorts A–Z.
  const datable = items.some((i) => i.createdAt);
  const sort = datable ? filters.sort : 'title';

  const categories = useMemo(
    () =>
      CATEGORIES.map((c) => ({ ...c, count: items.filter((i) => inCategory(i.contentType, c.key)).length })).filter(
        (c) => c.key === 'all' || c.count > 0
      ),
    [items]
  );

  const results = useMemo(() => {
    const needle = filters.q.trim().toLowerCase();
    const list = items.filter(
      (i) =>
        inCategory(i.contentType, filters.category) &&
        (!filters.subject || i.learningArea === filters.subject) &&
        matches(i, needle)
    );
    return sort === 'title'
      ? [...list].sort((a, b) => a.title.localeCompare(b.title))
      : [...list].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }, [items, filters, sort]);

  const filtering = Boolean(filters.q || filters.subject || filters.category !== 'all');

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {banner}

      {/* ── Category shelf + filters (nothing to filter in an empty library) ── */}
      {items.length > 0 && (
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
            role="tablist"
            aria-label="Categories"
          >
            {categories.map((c) => {
              const selected = c.key === filters.category;
              const Icon = c.icon;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onFilter('category', c.key)}
                  className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
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
                value={filters.subject}
                onChange={(e) => onFilter('subject', e.target.value)}
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
            {datable && (
              <select
                value={sort}
                onChange={(e) => onFilter('sort', e.target.value)}
                aria-label="Sort"
                className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-text-secondary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
              >
                <option value="newest">Newest first</option>
                <option value="title">A – Z</option>
              </select>
            )}
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
        <EmptyState {...error} />
      ) : items.length === 0 ? (
        <EmptyState {...empty} />
      ) : results.length === 0 ? (
        <EmptyState
          title="No matches"
          body={
            filters.q
              ? `Nothing matches “${filters.q}”. Try a different word, or clear the filters.`
              : 'Nothing matches these filters.'
          }
          action={{ label: 'Clear filters', onClick: onClear }}
        />
      ) : (
        <>
          {filtering && (
            <p className="mb-4 text-sm text-text-muted" aria-live="polite">
              {results.length} result{results.length === 1 ? '' : 's'}
              <button type="button" onClick={onClear} className="ml-3 cursor-pointer font-medium text-primary-700 hover:underline">
                Clear filters
              </button>
            </p>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {results.map((item) => (
              <PublicItemCard key={item.id} item={item} saved={savedIds?.has(item.id) ?? false} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
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
          className="mt-5 cursor-pointer rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:border-primary-200"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
