'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface PendingItem {
  id: string;
  title: string;
  contentType: string;
  uploaderName: string;
  uploaderSchoolName: string | null;
  submittedAt: string | null;
}

/** One unified cross-school queue — every school's pending submissions, oldest first. */
export default function LibraryApprovalQueuePage() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/library/content?scope=pending')
      .then((r) => r.json())
      .then((res) => (res.success ? setItems(res.data) : setError(res.message)))
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Library approvals</h1>
      <p className="text-sm text-text-muted mb-6">Pending submissions from every school, oldest first. Super-admin only.</p>

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-error">{error}</p>
      ) : items.length === 0 ? (
        <Card className="text-center py-10">
          <p className="text-sm text-text-muted">Nothing waiting for review.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link key={item.id} href={`/admin/system/library/${item.id}`}>
              <Card hover>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-primary-900 truncate">{item.title}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {item.uploaderName}
                      {item.uploaderSchoolName ? ` — ${item.uploaderSchoolName}` : ''}
                    </p>
                  </div>
                  <Badge variant="accent" className="capitalize shrink-0">
                    {item.contentType.replace('_', ' ')}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
