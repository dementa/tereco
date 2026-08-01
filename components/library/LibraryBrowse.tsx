'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
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
 * Content kinds grouped into browse tabs, so each grid is one uniform kind
 * of thing — videos never sit next to past papers. "Tutorials" is the
 * videos tab: where a learner goes to watch. Order here is tab order.
 */
const TABS: { key: string; label: string; types: LibraryItem['contentType'][] }[] = [
  { key: 'tutorials', label: 'Tutorials', types: ['video'] },
  { key: 'documents', label: 'Documents', types: ['document', 'notes'] },
  { key: 'past_papers', label: 'Past Papers', types: ['past_paper'] },
  { key: 'presentations', label: 'Presentations', types: ['presentation'] },
  { key: 'audiobooks', label: 'Audiobooks', types: ['audiobook'] },
  { key: 'resources', label: 'Resources', types: ['support_file'] },
];

/** Shared browse/consume view — used by students, parents, teachers, and admins browsing (not authoring). */
export function LibraryBrowse() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('tutorials');
  const [keyword, setKeyword] = useState('');
  const [active, setActive] = useState<LibraryItem | null>(null);

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

  // Only tabs that actually have content, so a learner never lands on an
  // empty tab. Counts come along for the tab labels.
  const visibleTabs = useMemo(
    () =>
      TABS.map((tab) => ({
        ...tab,
        count: items.filter((i) => tab.types.includes(i.contentType)).length,
      })).filter((tab) => tab.count > 0),
    [items]
  );

  // Keep the selected tab valid once content loads (default 'tutorials' may
  // have nothing) — fall back to the first tab that does.
  const currentTab = visibleTabs.find((t) => t.key === activeTab) ?? visibleTabs[0];

  const filtered = items.filter((item) => {
    if (!currentTab || !currentTab.types.includes(item.contentType)) return false;
    if (keyword) {
      const needle = keyword.toLowerCase();
      if (!item.title.toLowerCase().includes(needle) && !item.description.toLowerCase().includes(needle)) return false;
    }
    return true;
  });

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

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-error">{error}</p>
      ) : visibleTabs.length === 0 ? (
        <Card className="text-center py-10">
          <p className="text-sm text-text-muted">Nothing here yet.</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-10">
          <p className="text-sm text-text-muted">Nothing matches your search in this tab.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
