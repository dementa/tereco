'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import { useParentChildren } from '@/components/parent/ParentChildrenContext';
import { PracticalCard } from '@/components/ui/PracticalCard';
import { TermPerformanceCard } from '@/components/ui/TermPerformanceCard';
import type { BlendedPerformance, PracticalTermScore } from '@/lib/entities/practical-observations';
import type { StudentTermPerformance } from '@/lib/entities/performance';

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
  // Tagged with the child it belongs to rather than cleared on switch. Deriving
  // "is this the selected child's?" at render time makes showing the previous
  // child's standing impossible by construction, and avoids a synchronous
  // setState in an effect (react-hooks/set-state-in-effect).
  const [practical, setPractical] = useState<{
    studentId: string;
    score: PracticalTermScore | null;
    performance: BlendedPerformance | null;
  } | null>(null);
  const [termPerformance, setTermPerformance] = useState<{
    studentId: string;
    performance: StudentTermPerformance | null;
  } | null>(null);
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

  // Fetched separately and failing quietly on purpose: practical skills are a
  // supplement to this page, not its subject. A parent must still see every
  // assessment their child sat even if this lookup is unavailable.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    fetch(`/api/practical/summary?studentId=${selectedId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success)
          setPractical({ studentId: selectedId, score: d.data, performance: d.performance ?? null });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Fetched separately, same failure posture as practical above: this term's
  // blended performance is a supplement to the assessment table, not its
  // subject, so a failed lookup just leaves the card empty.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    fetch(`/api/performance/summary?studentId=${selectedId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setTermPerformance({ studentId: selectedId, performance: d.data ?? null });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Results</h1>
        <p className="text-sm text-text-muted">Every assessment your child has sat, newest first.</p>
      </div>

      {/* Kept above and visually separate from the assessment table: practical
          skills are observed in the lab, not sat as a paper, and must not read
          as one combined mark with the written results below. */}
      <TermPerformanceCard
        performance={termPerformance?.studentId === selectedId ? termPerformance.performance : null}
        voice="parent"
      />

      <PracticalCard
        score={practical?.studentId === selectedId ? practical.score : null}
        performance={practical?.studentId === selectedId ? practical.performance : null}
        voice="parent"
      />

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
