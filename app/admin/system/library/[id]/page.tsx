'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/ToastProvider';
import { Trash2 } from 'lucide-react';
import { LibraryItemViewer, type ViewableLibraryItem } from '@/components/library/LibraryItemViewer';
import { AudienceTargetEditor, type LibraryTarget, type SchoolOption } from '@/components/library/AudienceTargetEditor';
import { FeedbackList } from '@/components/library/FeedbackList';

interface Detail extends ViewableLibraryItem {
  id: string;
  description: string;
  learningArea: string | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  createdBy: string;
  reviewReason: string | null;
}

export default function LibraryApprovalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [item, setItem] = useState<Detail | null>(null);
  const [targets, setTargets] = useState<LibraryTarget[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLearningArea, setEditLearningArea] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const [itemRes, targetsRes, schoolsRes] = await Promise.all([
        fetch(`/api/library/content/${id}`).then((r) => r.json()),
        fetch(`/api/library/content/${id}/targets`).then((r) => r.json()),
        fetch('/api/directory/schools').then((r) => r.json()),
      ]);
      if (itemRes.success) {
        setItem(itemRes.data);
        setEditTitle(itemRes.data.title);
        setEditDescription(itemRes.data.description ?? '');
        setEditLearningArea(itemRes.data.learningArea ?? '');
      }
      if (targetsRes.success) setTargets(targetsRes.data);
      if (schoolsRes.success) setSchools(schoolsRes.data);
      setLoading(false);
    }
    load();
  }, [id]);

  async function saveTargets(next: LibraryTarget[]) {
    setTargets(next);
    const res = await fetch(`/api/library/content/${id}/targets`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targets: next }),
    }).then((r) => r.json());
    if (!res.success) toast.error(res.message);
  }

  async function saveEdits() {
    // Editing an approved item resets it to pending_approval (backend
    // behaviour, prevents post-approval edits from bypassing moderation) —
    // worth a heads-up here since a super-admin fixing their own typo would
    // otherwise be surprised their own approved item vanished from browse.
    if (item?.status === 'approved') {
      const proceed = window.confirm(
        'This item is currently approved. Saving will send it back to pending approval until reviewed again. Continue?'
      );
      if (!proceed) return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/library/content/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, description: editDescription, learningArea: editLearningArea || null }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setItem(res.data);
      toast.success('Saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem() {
    const proceed = window.confirm(`Delete "${item?.title}"? It will disappear from every list.`);
    if (!proceed) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/library/content/${id}`, { method: 'DELETE' }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success('Deleted.');
      router.push('/admin/system/library');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete this item.');
      setDeleting(false);
    }
  }

  async function approve() {
    setBusy(true);
    try {
      const res = await fetch(`/api/library/content/${id}/approve`, { method: 'POST' }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success('Approved.');
      router.push('/admin/system/library');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not approve.');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!reason.trim()) {
      toast.error('A rejection needs a reason.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/library/content/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success('Rejected.');
      router.push('/admin/system/library');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reject.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-text-muted">Loading…</p>;
  if (!item) return <p className="text-sm text-error">This item no longer exists.</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-3 xs:gap-4">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-primary-900 break-words">{item.title}</h1>
          <Badge variant={item.status === 'pending_approval' ? 'accent' : item.status === 'approved' ? 'success' : 'muted'}>
            {item.status.replace('_', ' ')}
          </Badge>
        </div>
        <Button variant="ghost" onClick={deleteItem} isLoading={deleting} className="text-error hover:bg-error-bg">
          <Trash2 className="w-4 h-4" /> Delete
        </Button>
      </div>

      <Card>
        <LibraryItemViewer item={item} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold text-primary-900">Details</h2>
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
        <Button onClick={saveEdits} isLoading={saving}>
          Save changes
        </Button>
      </Card>

      <Card>
        <AudienceTargetEditor targets={targets} onChange={saveTargets} schools={schools} locked={false} />
      </Card>

      {item.status === 'pending_approval' && (
        <Card className="space-y-3">
          <div className="flex flex-col xs:flex-row gap-3">
            <Button onClick={approve} isLoading={busy}>
              Approve
            </Button>
            <Button variant="outline" onClick={() => setShowReject((v) => !v)} disabled={busy}>
              Reject
            </Button>
          </div>
          {showReject && (
            <div className="space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Reason for rejection (shown to the uploader)"
                className="w-full rounded-xl border-2 border-[#E5E5E5] bg-white px-4 py-2.5 text-sm focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/10"
              />
              <Button variant="outline" onClick={reject} isLoading={busy}>
                Confirm rejection
              </Button>
            </div>
          )}
        </Card>
      )}

      {item.status === 'rejected' && item.reviewReason && (
        <Card>
          <p className="text-sm text-error">Rejected: {item.reviewReason}</p>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold text-primary-900 mb-3">Feedback</h2>
        <FeedbackList contentId={item.id} />
      </Card>
    </div>
  );
}
