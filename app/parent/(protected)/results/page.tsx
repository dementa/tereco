'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import { useParentChildren } from '@/components/parent/ParentChildrenContext';

interface Attempt {
  assessmentSystemId: string;
  title: string;
  submittedAt: string;
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  released: boolean;
}

const columns: DataTableColumn<Attempt>[] = [
  { key: 'title', header: 'Assessment', value: (a) => a.title },
  { key: 'submittedAt', header: 'Submitted', value: (a) => new Date(a.submittedAt).toLocaleDateString() },
  {
    key: 'score',
    header: 'Score',
    value: (a) => (a.released && a.totalScore !== null ? `${a.totalScore}/${a.maxScore}` : ''),
    render: (a) =>
      a.released ? (
        a.totalScore !== null ? (
          <span className="font-medium text-primary-900">
            {a.totalScore}/{a.maxScore}{' '}
            <span className="text-text-muted">({a.percentage}%)</span>
          </span>
        ) : (
          '—'
        )
      ) : (
        <Badge variant="muted">Not released</Badge>
      ),
  },
];

export default function ParentResultsPage() {
  const toast = useToast();
  const { selectedId, loading: childrenLoading } = useParentChildren();
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (studentId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/parent/results?studentId=${studentId}`);
      const data = await res.json();
      if (data.success) setAttempts(data.data);
      else toast.error(data.message ?? 'Failed to load results.');
    } catch {
      toast.error('Network error while loading results.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load(selectedId);
    })();
    return () => controller.abort();
  }, [selectedId, load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Results</h1>
        <p className="text-sm text-text-muted">Every assessment your child has sat, newest first.</p>
      </div>
      <DataTable
        rows={attempts}
        columns={columns}
        rowKey={(a) => a.assessmentSystemId}
        loading={loading || childrenLoading}
        initialSort={{ key: 'submittedAt', direction: 'desc' }}
        searchPlaceholder="Search by assessment title…"
        emptyMessage="No results yet."
        exportFileName="child-results"
      />
    </div>
  );
}
