'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { LibraryThumbnail, type LibraryThumbnailItem } from '@/components/library/LibraryThumbnail';
import { LibraryFullScreenViewer } from '@/components/library/LibraryFullScreenViewer';
import { Download } from 'lucide-react';

interface LibraryItem extends LibraryThumbnailItem {
  id: string;
  title: string;
  description: string;
  fileFormat: string | null;
  downloadable: boolean;
  learningArea: string | null;
  streamUrl: string | null;
  pageImageUrls: string[] | null;
  downloadAvailable: boolean;
  downloadUrl: string | null;
}

const CONTENT_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document' },
  { value: 'notes', label: 'Notes' },
  { value: 'support_file', label: 'Support file' },
  { value: 'audiobook', label: 'Audiobook' },
  { value: 'past_paper', label: 'Past paper' },
  { value: 'presentation', label: 'Presentation' },
];

/** Shared browse/consume view — used by students, parents, and teachers browsing (not authoring). */
export function LibraryBrowse() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contentType, setContentType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [active, setActive] = useState<LibraryItem | null>(null);

  // Fetched once; type/keyword narrow the already-loaded list client-side
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

  const filtered = items.filter((item) => {
    if (contentType && item.contentType !== contentType) return false;
    if (keyword) {
      const needle = keyword.toLowerCase();
      if (!item.title.toLowerCase().includes(needle) && !item.description.toLowerCase().includes(needle)) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Library</h1>
          <p className="text-sm text-text-muted mt-1">Reading and teaching material for free time.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <Select value={contentType} onChange={(e) => setContentType(e.target.value)} options={CONTENT_TYPE_OPTIONS} className="w-44" />
        <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Search…" className="w-56" />
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-error">{error}</p>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-10">
          <p className="text-sm text-text-muted">Nothing here yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <button key={item.id} type="button" onClick={() => setActive(item)} className="text-left">
              <Card hover className="cursor-pointer h-full !p-0 overflow-hidden">
                <LibraryThumbnail item={item} />
                <div className="p-4">
                  <p className="font-medium text-primary-900 truncate">{item.title}</p>
                  {item.learningArea && <p className="text-xs text-text-muted mt-0.5">{item.learningArea}</p>}
                  {item.downloadAvailable && (
                    <Badge variant="accent" className="mt-2 inline-flex items-center gap-1">
                      <Download className="w-3 h-3" /> Downloadable
                    </Badge>
                  )}
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {active && <LibraryFullScreenViewer item={active} onClose={() => setActive(null)} />}
    </div>
  );
}
