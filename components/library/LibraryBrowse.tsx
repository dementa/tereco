'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LibraryItemViewer } from '@/components/library/LibraryItemViewer';
import { FeedbackForm } from '@/components/library/FeedbackForm';
import { FileText, Video, Headphones, Presentation, Download } from 'lucide-react';

interface LibraryItem {
  id: string;
  title: string;
  description: string;
  contentType: 'video' | 'document' | 'notes' | 'support_file' | 'audiobook' | 'past_paper' | 'presentation';
  fileFormat: string | null;
  downloadable: boolean;
  learningArea: string | null;
  streamUrl: string;
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

const TYPE_ICON: Record<LibraryItem['contentType'], React.ElementType> = {
  video: Video,
  document: FileText,
  notes: FileText,
  support_file: FileText,
  audiobook: Headphones,
  past_paper: FileText,
  presentation: Presentation,
};

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
          {filtered.map((item) => {
            const Icon = TYPE_ICON[item.contentType];
            return (
              <button key={item.id} type="button" onClick={() => setActive(item)} className="text-left">
                <Card hover className="cursor-pointer h-full">
                  <div className="p-2.5 rounded-xl bg-bg-muted w-fit mb-3">
                    <Icon className="w-5 h-5 text-primary-700" />
                  </div>
                  <p className="font-medium text-primary-900 truncate">{item.title}</p>
                  {item.learningArea && <p className="text-xs text-text-muted mt-0.5">{item.learningArea}</p>}
                  {item.downloadable && (
                    <Badge variant="accent" className="mt-2 inline-flex items-center gap-1">
                      <Download className="w-3 h-3" /> Downloadable
                    </Badge>
                  )}
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <Modal open={active !== null} onClose={() => setActive(null)} title={active?.title} size="lg">
        {active && (
          <div className="space-y-4">
            {active.description && <p className="text-sm text-text-secondary">{active.description}</p>}
            <LibraryItemViewer item={active} />
            {active.downloadable && active.downloadUrl && (
              <a href={active.downloadUrl} download>
                <Button variant="secondary">
                  <Download className="w-4 h-4" /> Download
                </Button>
              </a>
            )}
            <div className="pt-2 border-t border-primary-100">
              <FeedbackForm contentId={active.id} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
