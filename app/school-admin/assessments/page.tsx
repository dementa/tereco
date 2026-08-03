'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';

interface Assessment {
  id: string;
  systemId: string;
  title: string;
  status: string;
  opensAt?: string;
  closesAt?: string;
  resultsReleasedAt?: string;
}

const columns: DataTableColumn<Assessment>[] = [
  { key: 'title', header: 'Title', value: (a) => a.title },
  { key: 'systemId', header: 'ID', value: (a) => a.systemId },
  {
    key: 'status',
    header: 'Status',
    value: (a) => a.status,
    render: (a) => <Badge variant={a.status === 'published' ? 'success' : 'muted'}>{a.status}</Badge>,
  },
  { key: 'opensAt', header: 'Opens', value: (a) => a.opensAt ?? '—' },
  { key: 'closesAt', header: 'Closes', value: (a) => a.closesAt ?? '—' },
  {
    key: 'resultsReleasedAt',
    header: 'Results',
    value: (a) => (a.resultsReleasedAt ? 'Released' : 'Not released'),
    render: (a) =>
      a.resultsReleasedAt ? <Badge variant="success">Released</Badge> : <Badge variant="muted">Not released</Badge>,
  },
];

export default function SchoolAdminAssessmentsPage() {
  const toast = useToast();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Assessments</h1>
        <p className="text-sm text-text-muted">
          Papers targeting your school, or open to every school. Read-only — authoring and marking
          stay with staff.
        </p>
      </div>
      <DataTable
        rows={assessments}
        columns={columns}
        rowKey={(a) => a.id}
        loading={loading}
        initialSort={{ key: 'title', direction: 'asc' }}
        searchPlaceholder="Search by title or ID…"
        emptyMessage="No assessments target your school yet."
        exportFileName="school-assessments"
      />
    </div>
  );
}
