'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthContext';
import { type LibraryThumbnailItem } from '@/components/library/LibraryThumbnail';
import { LibraryBookCard } from '@/components/library/LibraryBookCard';
import { LibraryFullScreenViewer } from '@/components/library/LibraryFullScreenViewer';

interface LibraryItem extends LibraryThumbnailItem {
  id: string;
  title: string;
  description: string;
  fileFormat: string | null;
  downloadable: boolean;
  learningArea: string | null;
  authorName: string;
  createdAt: string;
  streamUrl: string | null;
  pageImageUrls: string[] | null;
  downloadAvailable: boolean;
  downloadUrl: string | null;
}

/**
 * One practice paper.
 *
 * A link, not a button opening the viewer: an E-Paper is a screen you go to and
 * work on, not a file you preview in a lightbox like everything else in here.
 */
function EPaperCard({ paper }: { paper: EPaper }) {
  return (
    <Link
      href={`/student/practice/${encodeURIComponent(paper.systemId)}`}
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40"
    >
      <Card hover className="p-4 h-full flex flex-col">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-bg-muted shrink-0">
            <FileText className="w-5 h-5 text-primary-700" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-primary-900 break-words">{paper.title}</p>
            <p className="text-xs text-text-muted mt-0.5">
              {paper.questionCount} question{paper.questionCount === 1 ? '' : 's'} • no timer
            </p>
          </div>
        </div>

        {paper.description && (
          <p className="text-sm text-text-muted mt-2 line-clamp-2">{paper.description}</p>
        )}

        {/*
          Shown only once they have actually practised it. A "0 attempts" label
          on every card would just be a wall of zeros telling a learner what
          they have not done.
        */}
        {paper.attemptCount > 0 && (
          <p className="text-xs text-text-faint mt-auto pt-2">
            Practised {paper.attemptCount} time{paper.attemptCount === 1 ? '' : 's'}
          </p>
        )}
      </Card>
    </Link>
  );
}

/** A closed assessment republished for untimed practice. See lib/e-papers.ts. */
interface EPaper {
  id: string;
  systemId: string;
  title: string;
  description: string;
  timeLimitMinutes: number;
  ePaperAt: string | null;
  questionCount: number;
  attemptCount: number;
}

/**
 * Content kinds grouped into browse tabs, so each grid is one uniform kind
 * of thing — videos never sit next to past papers. "Tutorials" is the
 * videos tab: where a learner goes to watch. Order here is tab order.
 *
 * E-Papers is the one tab that is not `library_content` at all: it renders
 * closed assessments straight out of `e_papers_for_student`. That is the
 * acknowledged cost of keeping one source of truth for a paper — the branch is
 * confined to the fetch and the card, and must not spread further into this
 * component.
 *
 * It is named E-Papers, not "Past Papers", because `content_type = 'past_paper'`
 * already exists and means uploaded PDFs. Both tabs coexist and mean different
 * things: Past Papers is a file to read, an E-Paper is a paper to sit.
 */
type Tab =
  | { key: string; label: string; kind: 'content'; types: LibraryItem['contentType'][] }
  | { key: string; label: string; kind: 'e_paper' };

const TABS: Tab[] = [
  { key: 'tutorials', label: 'Tutorials', kind: 'content', types: ['video'] },
  { key: 'documents', label: 'Documents', kind: 'content', types: ['document', 'notes'] },
  { key: 'e_papers', label: 'E-Papers', kind: 'e_paper' },
  { key: 'past_papers', label: 'Past Papers', kind: 'content', types: ['past_paper'] },
  { key: 'presentations', label: 'Presentations', kind: 'content', types: ['presentation'] },
  { key: 'audiobooks', label: 'Audiobooks', kind: 'content', types: ['audiobook'] },
  { key: 'resources', label: 'Resources', kind: 'content', types: ['support_file'] },
];

/** Shared browse/consume view — used by students, parents, teachers, and admins browsing (not authoring). */
export function LibraryBrowse() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('tutorials');
  const [keyword, setKeyword] = useState('');
  const [active, setActive] = useState<LibraryItem | null>(null);
  const [ePapers, setEPapers] = useState<EPaper[]>([]);
  const [ePapersLoading, setEPapersLoading] = useState(true);

  // Staff, parents and admins browse the same Library, but an E-Paper is
  // something a learner sits — eligibility is per-student and the endpoint is
  // students-only, so the tab simply does not exist for anyone else.
  const { user } = useAuth();
  const isStudent = user?.role === 'student';

  // Fetched once; tab/keyword narrow the already-loaded list client-side
  // (mirrors app/staff/lessons/page.tsx) rather than re-fetching per
  // keystroke — a school's library is small enough that this is simpler
  // and cheaper than a request per filter change.
  useEffect(() => {
    fetch('/api/library/content')
      .then((r) => r.json())
      .then((res) => (res.success ? setItems(res.data) : setError(res.message)))
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  // Fetched separately because it is a different entity from a different table.
  // A failure here is deliberately silent: a learner browsing for a video
  // should not be shown an error about practice papers, and an empty list just
  // means the tab does not appear.
  useEffect(() => {
    if (!isStudent) return;
    fetch('/api/student/e-papers')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setEPapers(res.data);
      })
      .catch(() => {})
      .finally(() => setEPapersLoading(false));
  }, [isStudent]);

  // Only tabs that actually have content, so a learner never lands on an
  // empty tab. Counts come along for the tab labels.
  const visibleTabs = useMemo(
    () =>
      TABS.map((tab) => ({
        ...tab,
        count:
          tab.kind === 'e_paper'
            ? isStudent
              ? ePapers.length
              : 0
            : items.filter((i) => tab.types.includes(i.contentType)).length,
      })).filter((tab) => tab.count > 0),
    [items, ePapers, isStudent]
  );

  // Keep the selected tab valid once content loads (default 'tutorials' may
  // have nothing) — fall back to the first tab that does.
  const currentTab = visibleTabs.find((t) => t.key === activeTab) ?? visibleTabs[0];

  const filtered = items.filter((item) => {
    if (!currentTab || currentTab.kind !== 'content') return false;
    if (!currentTab.types.includes(item.contentType)) return false;
    if (keyword) {
      const needle = keyword.toLowerCase();
      if (!item.title.toLowerCase().includes(needle) && !item.description.toLowerCase().includes(needle)) return false;
    }
    return true;
  });

  const filteredEPapers = ePapers.filter((p) => {
    if (!keyword) return true;
    const needle = keyword.toLowerCase();
    return (
      p.title.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle)
    );
  });

  const showingEPapers = currentTab?.kind === 'e_paper';
  const emptyForTab = showingEPapers ? filteredEPapers.length === 0 : filtered.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Library</h1>
          <p className="text-sm text-text-muted mt-1">Reading and teaching material for free time.</p>
        </div>
      </div>

      {!loading && !error && visibleTabs.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 border-b border-[#EAEAEA] mb-4">
            {visibleTabs.map((tab) => {
              const selected = currentTab?.key === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`-mb-px px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    selected
                      ? 'border-primary-700 text-primary-900'
                      : 'border-transparent text-text-muted hover:text-primary-900'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 text-xs ${selected ? 'text-primary-700' : 'text-text-muted/70'}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mb-5">
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Search this tab…" className="w-full sm:w-64" />
          </div>
        </>
      )}

      {loading || (isStudent && ePapersLoading) ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-error">{error}</p>
      ) : visibleTabs.length === 0 ? (
        <Card className="text-center py-10">
          <p className="text-sm text-text-muted">Nothing here yet.</p>
        </Card>
      ) : emptyForTab ? (
        <Card className="text-center py-10">
          <p className="text-sm text-text-muted">Nothing matches your search in this tab.</p>
        </Card>
      ) : showingEPapers ? (
        // Wider cards than the book grid: an E-Paper has no cover to recognise
        // it by, so the title has to carry it and needs room to be read.
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredEPapers.map((paper) => (
            <EPaperCard key={paper.id} paper={paper} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item)}
              className="text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40"
            >
              <LibraryBookCard item={item} />
            </button>
          ))}
        </div>
      )}

      {active && <LibraryFullScreenViewer item={active} onClose={() => setActive(null)} />}
    </div>
  );
}
