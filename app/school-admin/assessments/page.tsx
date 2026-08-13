'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/ToastProvider';
import { AssessmentCard, type CardAssessment } from '@/components/assessment/AssessmentCard';
import { MarkingProgressPanel } from '@/components/school-admin/MarkingProgressPanel';

export default function SchoolAdminAssessmentsPage() {
  const router = useRouter();
  const toast = useToast();
  const [assessments, setAssessments] = useState<CardAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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
    if (!q) return assessments;
    return assessments.filter(
      (a) => a.title.toLowerCase().includes(q) || a.systemId.toLowerCase().includes(q)
    );
  }, [assessments, search]);

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

        <Input
          label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or ID…"
        />

        {loading ? (
          <p className="text-text-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-text-muted">No assessments target your school yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((a) => (
              <AssessmentCard
                key={a.id}
                assessment={a}
                onClick={() => router.push(`/school-admin/assessments/${a.systemId}`)}
              />
            ))}
          </div>
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
