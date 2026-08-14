'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import { AssessmentCard, type CardAssessment } from '@/components/assessment/AssessmentCard';
import { AssessmentTable } from '@/components/assessment/AssessmentTable';
import { MarkingProgressPanel } from '@/components/school-admin/MarkingProgressPanel';
import { SortMenu, type SortDir, type SortField } from '@/components/ui/SortMenu';
import { ViewToggle, type ListView } from '@/components/ui/ViewToggle';

export default function SchoolAdminAssessmentsPage() {
  const router = useRouter();
  const toast = useToast();
  const [assessments, setAssessments] = useState<CardAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [view, setView] = useState<ListView>('card');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/school-admin/assessments');
        const data = await res.json();
        if (cancelled) return;
        if (data.success) setAssessments(data.data);
        else toast.error(data.message ?? 'Failed to load assessments.');
      } catch {
        if (!cancelled) toast.error('Network error while loading assessments.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? assessments.filter(
          (a) => a.title.toLowerCase().includes(q) || a.systemId.toLowerCase().includes(q)
        )
      : assessments;
    const sorted = [...filtered];
    if (sortField === 'name') {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      if (sortDir === 'desc') sorted.reverse();
    } else if (sortDir === 'asc') {
      // 'created': the API already returns newest-first, so descending needs
      // no work and ascending is just that order reversed.
      sorted.reverse();
    }
    return sorted;
  }, [assessments, search, sortField, sortDir]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <div className="flex-1 min-w-0 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 mb-1">Assessments</h1>
          <p className="text-sm text-text-muted">
            Papers targeting your school, or open to every school. Read-only — authoring and marking
            stay with staff.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative w-full sm:w-64 shrink-0">
            <Search
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or ID…"
              aria-label="Search assessments"
              className="w-full h-9 rounded-lg border border-border-strong bg-bg-card pl-9 pr-3 text-sm transition-colors focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/15"
            />
          </div>

          <SortMenu
            field={sortField}
            dir={sortDir}
            onChange={(f, d) => {
              setSortField(f);
              setSortDir(d);
            }}
          />

          <ViewToggle view={view} onChange={setView} />
        </div>

        {loading ? (
          <p className="text-text-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-text-muted">No assessments target your school yet.</p>
        ) : view === 'card' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((a) => (
              <AssessmentCard
                key={a.id}
                assessment={a}
                onClick={() => router.push(`/school-admin/assessments/${a.systemId}`)}
              />
            ))}
          </div>
        ) : (
          <AssessmentTable
            assessments={visible}
            onRowClick={(a) => router.push(`/school-admin/assessments/${a.systemId}`)}
            emptyMessage="No assessments target your school yet."
          />
        )}
      </div>

      {/* Narrower than the app's usual 50/50 two-panel split — the reference
          usage panel is deliberately a slim sidebar, not an equal column. */}
      <div className="w-full lg:w-80 shrink-0">
        <MarkingProgressPanel />
      </div>
    </div>
  );
}
