'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Check, ChevronRight, Download, ListChecks, Share2, WifiOff } from 'lucide-react';
import { LibraryFullScreenViewer } from '@/components/library/LibraryFullScreenViewer';
import { SaveForOfflineButton } from '@/components/library/SaveForOfflineButton';
import { PublicCover } from '@/components/library/public/PublicCover';
import { PublicItemCard } from '@/components/library/public/PublicItemCard';
import { TYPE_META, formatDate, sizeLabel } from '@/components/library/public/libraryMeta';
import { usePublicLibrary, type PublicItem } from '@/components/library/public/usePublicLibrary';
import { getSaved, toDetailItem } from '@/lib/library-offline-store';

interface QuizSummary {
  id: string;
  title: string;
  questionCount: number;
}

type Detail = PublicItem & { quizzes: QuizSummary[] };

/**
 * One public Library item. Reads /api/library/public/[id]; with no network,
 * the copy saved on this device. Feedback is left out of the viewer — it
 * needs an account.
 */
export function PublicItemDetail() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [reading, setReading] = useState(false);
  const library = usePublicLibrary();

  useEffect(() => {
    fetch(`/api/library/public/${id}`)
      .then((r) => r.json())
      .then((res) => (res.success ? setItem(res.data) : setError(res.message || 'Could not load this item.')))
      .catch(async () => {
        const saved = await getSaved(id).catch(() => null);
        if (!saved) return setError("You're offline and this item isn't saved on this device.");
        setItem({ ...toDetailItem(saved), createdAt: new Date(saved.savedAt).toISOString() });
        setOfflineCopy(true);
      });
  }, [id]);

  // More from the same subject first, then the same kind of item.
  const related = useMemo(() => {
    if (!item) return [];
    const others = library.items.filter((i) => i.id !== item.id);
    const score = (i: PublicItem) =>
      (item.learningArea && i.learningArea === item.learningArea ? 2 : 0) + (i.contentType === item.contentType ? 1 : 0);
    return others
      .map((i) => ({ i, s: score(i) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map(({ i }) => i);
  }, [item, library.items]);

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-semibold text-text-primary">{error}</h1>
        <Link href="/library" className="mt-4 inline-block font-medium text-primary-700 hover:underline">
          Back to the library
        </Link>
      </div>
    );
  }

  if (!item) return <DetailSkeleton />;

  const meta = TYPE_META[item.contentType];
  const Icon = meta.icon;
  const size = sizeLabel(item);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
        <Link href="/library" className="hover:text-primary-700">
          Library
        </Link>
        <ChevronRight className="h-4 w-4 text-text-faint" aria-hidden />
        <span className="truncate text-text-secondary">{item.title}</span>
      </nav>

      {offlineCopy && (
        <p className="mb-6 flex items-center gap-2 rounded-xl bg-accent-lighter px-4 py-2.5 text-sm text-text-secondary ring-1 ring-accent">
          <WifiOff className="h-4 w-4 shrink-0 text-accent-dark" aria-hidden /> You&apos;re offline — this is the copy saved on
          this device.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
        {/* ── Preview ── */}
        <button
          type="button"
          onClick={() => setReading(true)}
          className="group relative block w-full overflow-hidden rounded-3xl border border-border bg-primary-50 text-left shadow-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-200 lg:self-start"
          aria-label={`${meta.action}: ${item.title}`}
        >
          <PublicCover item={item} className="aspect-[4/3]" large />
          <span className="absolute inset-x-0 bottom-0 flex justify-center pb-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-primary-700 shadow-lg ring-1 ring-black/5 transition-transform group-hover:scale-105">
              <Icon className="h-5 w-5" aria-hidden /> {meta.action}
            </span>
          </span>
        </button>

        {/* ── About ── */}
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
              <Icon className="h-3.5 w-3.5" aria-hidden /> {meta.label}
            </span>
            {item.learningArea && (
              <span className="rounded-full bg-bg-muted px-3 py-1 text-xs font-semibold text-text-secondary">
                {item.learningArea}
              </span>
            )}
          </div>

          <h1 className="text-2xl font-bold leading-tight tracking-tight text-text-primary sm:text-3xl">{item.title}</h1>

          <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-text-muted">
            {item.authorName && (
              <div>
                <dt className="sr-only">Teacher</dt>
                <dd>By {item.authorName}</dd>
              </div>
            )}
            {!offlineCopy && formatDate(item.createdAt) && (
              <div>
                <dt className="sr-only">Added</dt>
                <dd>Added {formatDate(item.createdAt)}</dd>
              </div>
            )}
            {size && (
              <div>
                <dt className="sr-only">Size</dt>
                <dd>{size}</dd>
              </div>
            )}
          </dl>

          {item.description?.trim() && (
            <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-text-secondary">{item.description}</p>
          )}

          <div className="mt-7 flex flex-col gap-3 xs:flex-row xs:flex-wrap xs:items-center">
            <button
              type="button"
              onClick={() => setReading(true)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary-700 px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-200"
            >
              <Icon className="h-5 w-5" aria-hidden /> {meta.action}
            </button>
            {item.downloadAvailable && item.downloadUrl && (
              <a
                href={item.downloadUrl}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border-strong bg-white px-5 text-sm font-semibold text-text-primary hover:border-primary-200 hover:text-primary-700"
              >
                <Download className="h-4 w-4" aria-hidden /> Download PDF
              </a>
            )}
            <ShareButton title={item.title} />
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-bg-subtle p-4">
            <p className="mb-3 text-sm font-semibold text-text-primary">Use it without internet</p>
            <SaveForOfflineButton contentId={item.id} />
          </div>
        </div>
      </div>

      {/* ── Quizzes ── */}
      <section aria-labelledby="quizzes-heading" className="mt-14">
        <h2 id="quizzes-heading" className="mb-4 flex items-center gap-2 text-xl font-bold text-text-primary">
          <ListChecks className="h-5 w-5 text-primary-700" aria-hidden /> Practice quizzes
        </h2>
        {item.quizzes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border-strong px-5 py-6 text-sm text-text-muted">
            No quizzes for this item yet.
          </p>
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            {item.quizzes.map((q) => (
              <li key={q.id} className="min-w-0">
                <Link
                  href={`/library/${item.id}/quiz/${q.id}`}
                  className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-white p-4 transition hover:border-primary-200 hover:shadow-md"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent-dark">
                      <ListChecks className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-text-primary">{q.title}</p>
                      <p className="text-xs text-text-muted">
                        {q.questionCount} question{q.questionCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-primary-700 group-hover:underline">Start</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-14">
          <h2 id="related-heading" className="mb-4 text-xl font-bold text-text-primary">
            {item.learningArea ? `More in ${item.learningArea}` : 'You might also like'}
          </h2>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {related.map((r) => (
              <PublicItemCard key={r.id} item={r} saved={library.savedIds.has(r.id)} />
            ))}
          </div>
        </section>
      )}

      {reading && <LibraryFullScreenViewer item={item} onClose={() => setReading(false)} feedback={false} />}
    </div>
  );
}

/** The phone's own share sheet where there is one; copy the link everywhere else. */
function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border-strong bg-white px-5 text-sm font-semibold text-text-primary hover:border-primary-200 hover:text-primary-700"
    >
      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
      {copied ? 'Link copied' : 'Share'}
    </button>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-busy>
      <div className="mb-6 h-4 w-40 animate-pulse rounded bg-bg-muted" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
        <div className="aspect-[4/3] animate-pulse rounded-3xl bg-bg-muted" />
        <div className="space-y-4">
          <div className="h-6 w-32 animate-pulse rounded-full bg-bg-muted" />
          <div className="h-8 w-4/5 animate-pulse rounded bg-bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-bg-muted" />
          <div className="h-20 w-full animate-pulse rounded bg-bg-muted" />
          <div className="h-12 w-40 animate-pulse rounded-xl bg-bg-muted" />
        </div>
      </div>
    </div>
  );
}
