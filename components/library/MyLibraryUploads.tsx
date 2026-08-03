'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastProvider';
import { Trash2 } from 'lucide-react';
import { LibraryThumbnail, type LibraryThumbnailItem } from '@/components/library/LibraryThumbnail';

interface LibraryContent extends LibraryThumbnailItem {
  id: string;
  title: string;
  description: string;
  learningArea: string | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  reviewReason: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<LibraryContent['status'], 'default' | 'accent' | 'success' | 'muted'> = {
  draft: 'muted',
  pending_approval: 'accent',
  approved: 'success',
  rejected: 'default',
};

const STATUS_LABEL: Record<LibraryContent['status'], string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

export function MyLibraryUploads({ newHref }: { newHref: string }) {
  const toast = useToast();
  const [items, setItems] = useState<LibraryContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<LibraryContent | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLearningArea, setEditLearningArea] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reused after edit/delete/submit to refresh the list. Deliberately never
  // flips `loading` back to true on those refreshes (only the initial
  // useState(true) default shows the loading state) — same reasoning as
  // components/library/LibraryBrowse.tsx: calling setState synchronously at
  // the top of an effect body is flagged (react-hooks/set-state-in-effect),
  // and a full-page "Loading…" flash on every quick background refresh
  // would be worse UX anyway.
  function load() {
    fetch('/api/library/content?scope=mine')
      .then((r) => r.json())
      .then((res) => (res.success ? setItems(res.data) : setError(res.message)))
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function openEdit(item: LibraryContent) {
    setEditing(item);
    setEditTitle(item.title);
    setEditDescription(item.description);
    setEditLearningArea(item.learningArea ?? '');
  }

  async function saveEdit() {
    if (!editing) return;
    if (editing.status === 'approved') {
      const proceed = window.confirm('This item is approved. Saving will send it back to pending approval. Continue?');
      if (!proceed) return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/library/content/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, description: editDescription, learningArea: editLearningArea || null }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success('Saved.');
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function submitForApproval() {
    if (!editing) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/library/content/${editing.id}/submit`, { method: 'POST' }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success('Submitted for approval.');
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit for approval.');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteItem() {
    if (!editing) return;
    const proceed = window.confirm(`Delete "${editing.title}"? It will disappear from every list.`);
    if (!proceed) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/library/content/${editing.id}`, { method: 'DELETE' }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success('Deleted.');
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete this item.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-primary-900">Library uploads</h1>
          <p className="text-sm text-text-muted mt-1">Reading and teaching material you&apos;ve shared, awaiting or past super-admin review.</p>
        </div>
        <Link href={newHref}>
          <Button>Upload</Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-error">{error}</p>
      ) : items.length === 0 ? (
        <Card className="text-center py-10">
          <p className="text-sm text-text-muted">Nothing uploaded yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <button key={item.id} type="button" onClick={() => openEdit(item)} className="block w-full text-left">
              <Card hover className="!p-0 overflow-hidden">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-16 xs:w-24 shrink-0 self-stretch">
                    <LibraryThumbnail item={item} />
                  </div>
                  {/* Title and status badge sit side by side from `xs` up; below
                      that the badge would leave the title ~140px and it would
                      truncate to nothing, so the badge drops to its own line. */}
                  <div className="flex-1 min-w-0 flex flex-col xs:flex-row xs:items-start xs:justify-between gap-1 xs:gap-4 py-3 pr-3 sm:pr-4">
                    <div className="min-w-0">
                      <p className="font-medium text-primary-900 truncate">{item.title}</p>
                      <p className="text-xs text-text-muted mt-0.5 capitalize">{item.contentType.replace('_', ' ')}</p>
                      {item.status === 'rejected' && item.reviewReason && (
                        <p className="text-xs text-error mt-1.5">Reason: {item.reviewReason}</p>
                      )}
                    </div>
                    <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.title}>
        {editing && (
          <div className="space-y-4">
            <Input label="Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-muted tracking-wide">Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                className="w-full rounded-xl border-2 border-[#E5E5E5] bg-white px-4 py-2.5 text-sm focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/10"
              />
            </div>
            <Input label="Subject" value={editLearningArea} onChange={(e) => setEditLearningArea(e.target.value)} placeholder="e.g. Mathematics" />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={saveEdit} isLoading={saving}>
                Save changes
              </Button>
              {editing.status === 'draft' && (
                <Button variant="outline" onClick={submitForApproval} isLoading={submitting}>
                  Submit for approval
                </Button>
              )}
              <Button variant="ghost" onClick={deleteItem} isLoading={deleting} className="text-error hover:bg-error-bg ml-auto">
                <Trash2 className="w-4 h-4" /> Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
