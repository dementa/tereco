'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { ArrowLeft, BookOpen, ListChecks } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { LibraryThumbnail, type LibraryThumbnailItem } from '@/components/library/LibraryThumbnail';
import { LibraryFullScreenViewer, type FullScreenLibraryItem } from '@/components/library/LibraryFullScreenViewer';

interface QuizSummary {
  id: string;
  title: string;
  status: 'draft' | 'published';
  questionCount: number;
}

type DetailItem = FullScreenLibraryItem &
  LibraryThumbnailItem & {
    learningArea: string | null;
    authorName?: string;
    quizzes: QuizSummary[];
    canManage: boolean;
  };

const TYPE_LABEL: Record<string, string> = {
  video: 'Video',
  document: 'Document',
  notes: 'Notes',
  support_file: 'Resource',
  audiobook: 'Audiobook',
  past_paper: 'Past paper',
  presentation: 'Presentation',
};

/**
 * The page a learner lands on when they click a library card: title, subject,
 * description, the file itself, and the quizzes attached to it. Shared by every
 * role's `library/[id]` route — the back link is derived from the current path
 * so it needs no per-role configuration.
 */
export function LibraryItemDetail() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const backHref = pathname.replace(/\/[^/]+$/, '');

  const [item, setItem] = useState<DetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);

  useEffect(() => {
    fetch(`/api/library/content/${id}/detail`)
      .then((r) => r.json())
      .then((res) => (res.success ? setItem(res.data) : setError(res.message || 'Could not load this item.')))
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden /> Back to library
      </Link>

      {loading && <p className="text-sm text-text-muted">Loading…</p>}
      {!loading && error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {item && (
        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-primary-700 bg-bg-muted rounded-full px-2.5 py-1">
                {TYPE_LABEL[item.contentType] ?? item.contentType}
              </span>
              {item.learningArea && (
                <span className="text-xs font-medium text-text-secondary bg-bg-muted rounded-full px-2.5 py-1">
                  {item.learningArea}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-primary-900 break-words">{item.title}</h1>
            {item.authorName && <p className="text-sm text-text-muted mt-1">By {item.authorName}</p>}
          </div>

          {item.description && (
            <p className="text-sm text-text-secondary whitespace-pre-line">{item.description}</p>
          )}

          <Card className="!p-0 overflow-hidden">
            <button
              type="button"
              onClick={() => setReading(true)}
              className="group block w-full text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40"
              aria-label={`Open ${item.title}`}
            >
              <LibraryThumbnail item={item} aspectClassName="aspect-video" />
              <span className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-primary-700 group-hover:bg-primary-800">
                <BookOpen className="w-4 h-4" aria-hidden /> Open document
              </span>
            </button>
          </Card>

          <section aria-labelledby="quizzes-heading">
            <h2 id="quizzes-heading" className="flex items-center gap-2 text-lg font-semibold text-primary-900 mb-3">
              <ListChecks className="w-5 h-5" aria-hidden /> Quizzes
            </h2>
            {item.quizzes.length === 0 ? (
              <p className="text-sm text-text-muted">No quizzes for this document yet.</p>
            ) : (
              <ul className="space-y-2">
                {item.quizzes.map((q) => (
                  <li key={q.id}>
                    <Card className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-primary-900 truncate">{q.title}</p>
                        <p className="text-xs text-text-muted">
                          {q.questionCount} question{q.questionCount === 1 ? '' : 's'}
                          {q.status === 'draft' && ' • draft (only you can see this)'}
                        </p>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {item && reading && <LibraryFullScreenViewer item={item} onClose={() => setReading(false)} />}
    </div>
  );
}
