'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import { Eye, Plus, Trash2 } from 'lucide-react';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';

type Status = 'draft' | 'pending_approval' | 'approved' | 'rejected';

interface Item {
  id: string;
  title: string;
  contentType: string;
  learningArea: string | null;
  status: Status;
  uploaderName: string;
  uploaderSchoolName: string | null;
  submittedAt: string | null;
  createdAt: string;
}

const STATUS_BADGE: Record<Status, { variant: 'default' | 'accent' | 'success' | 'muted'; label: string }> = {
  draft: { variant: 'default', label: 'Draft' },
  pending_approval: { variant: 'accent', label: 'Pending' },
  approved: { variant: 'success', label: 'Approved' },
  rejected: { variant: 'muted', label: 'Rejected' },
};

const prettyType = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

/**
 * The whole system library — every school's content in every status — so a
 * super-admin can find and manage any item, not just what's awaiting review.
 * Approvals are still here: filter to Pending. Each row opens the detail page
 * (edit / delete / approve / reject / audience), and the trash icon is a
 * shortcut for the common "just get rid of it" case.
 */
export default function SystemLibraryPage() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/library/content?scope=all')
      .then((r) => r.json())
      .then((res) => (res.success ? setItems(res.data) : setError(res.message)))
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

  async function deleteItem(item: Item) {
    if (!window.confirm(`Delete "${item.title}"? It will disappear from every list.`)) return;
    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/library/content/${item.id}`, { method: 'DELETE' }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success('Deleted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete this item.');
    } finally {
      setDeletingId(null);
    }
  }

  const pendingCount = items.filter((i) => i.status === 'pending_approval').length;

  const columns: DataTableColumn<Item>[] = [
    { key: 'title', header: 'Title', value: (r) => r.title },
    {
      key: 'contentType',
      header: 'Type',
      value: (r) => prettyType(r.contentType),
      hideOnMobile: true,
    },
    { key: 'uploaderName', header: 'Uploader', value: (r) => r.uploaderName || '—', hideOnMobile: true },
    {
      key: 'uploaderSchoolName',
      header: 'School',
      value: (r) => r.uploaderSchoolName ?? '—',
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Status',
      value: (r) => STATUS_BADGE[r.status].label,
      render: (r) => <Badge variant={STATUS_BADGE[r.status].variant}>{STATUS_BADGE[r.status].label}</Badge>,
    },
    {
      key: 'createdAt',
      header: 'Added',
      value: (r) => r.createdAt,
      render: (r) => <span className="text-text-muted">{formatDate(r.createdAt)}</span>,
      hideOnMobile: true,
    },
  ];

  const rowActions = (r: Item): DropdownMenuItem[] => [
    { label: 'Open', icon: Eye, onClick: () => router.push(`/admin/system/library/${r.id}`) },
    {
      label: 'Delete',
      icon: Trash2,
      danger: true,
      separatorBefore: true,
      disabled: deletingId === r.id,
      onClick: () => void deleteItem(r),
    },
  ];

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">System library</h1>
      <p className="text-sm text-text-muted mb-6">
        Every school&apos;s content, in every status.
        {pendingCount > 0 && (
          <>
            {' '}
            <span className="font-medium text-primary-900">{pendingCount}</span> awaiting review —
            filter to <span className="font-medium">Pending</span> to approve.
          </>
        )}
      </p>

      {error ? (
        <p className="text-sm text-error">{error}</p>
      ) : (
        <DataTable
          rows={items}
          columns={columns}
          rowActions={rowActions}
          rowKey={(r) => r.id}
          loading={loading}
          initialSort={{ key: 'createdAt', direction: 'desc' }}
          onRowClick={(r) => router.push(`/admin/system/library/${r.id}`)}
          mobileTitle={(r) => r.title}
          searchPlaceholder="Search by title, uploader, school…"
          emptyMessage="No library content yet."
          exportFileName="system-library"
          actions={
            <Link href="/admin/library/new">
              <Button>
                <Plus className="w-4 h-4 mr-1.5" aria-hidden />
                Upload
              </Button>
            </Link>
          }
          filters={[
            {
              key: 'status',
              label: 'Status',
              options: [
                { value: 'pending_approval', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'draft', label: 'Draft' },
              ],
              matches: (r, v) => r.status === v,
            },
            {
              key: 'contentType',
              label: 'Type',
              options: [
                { value: 'video', label: 'Video' },
                { value: 'document', label: 'Document' },
                { value: 'notes', label: 'Notes' },
                { value: 'support_file', label: 'Support file' },
                { value: 'audiobook', label: 'Audiobook' },
                { value: 'past_paper', label: 'Past paper' },
                { value: 'presentation', label: 'Presentation' },
              ],
              matches: (r, v) => r.contentType === v,
            },
          ]}
        />
      )}
    </div>
  );
}
