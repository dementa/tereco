'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface LibraryContent {
  id: string;
  title: string;
  contentType: string;
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
  const [items, setItems] = useState<LibraryContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/library/content?scope=mine')
      .then((r) => r.json())
      .then((res) => (res.success ? setItems(res.data) : setError(res.message)))
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Library uploads</h1>
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
            <Card key={item.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-primary-900 truncate">{item.title}</p>
                  <p className="text-xs text-text-muted mt-0.5 capitalize">{item.contentType.replace('_', ' ')}</p>
                  {item.status === 'rejected' && item.reviewReason && (
                    <p className="text-xs text-error mt-1.5">Reason: {item.reviewReason}</p>
                  )}
                </div>
                <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABEL[item.status]}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
