'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import { useParentChildren } from '@/components/parent/ParentChildrenContext';

interface AttendanceRecord {
  id: string;
  sessionDate: string;
  period: number;
  className: string;
  streamName: string;
  present: boolean;
}

const columns: DataTableColumn<AttendanceRecord>[] = [
  { key: 'sessionDate', header: 'Date', value: (a) => a.sessionDate },
  { key: 'className', header: 'Class', value: (a) => [a.className, a.streamName].filter(Boolean).join(' ') },
  { key: 'period', header: 'Period', value: (a) => String(a.period) },
  {
    key: 'present',
    header: 'Status',
    value: (a) => (a.present ? 'Present' : 'Absent'),
    render: (a) => (a.present ? <Badge variant="success">Present</Badge> : <Badge variant="muted">Absent</Badge>),
  },
];

export default function ParentAttendancePage() {
  const toast = useToast();
  const { selectedId, loading: childrenLoading } = useParentChildren();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (studentId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/parent/attendance?studentId=${studentId}`);
      const data = await res.json();
      if (data.success) setRecords(data.data);
      else toast.error(data.message ?? 'Failed to load attendance.');
    } catch {
      toast.error('Network error while loading attendance.');
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
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Attendance</h1>
        <p className="text-sm text-text-muted">Your child&apos;s attendance history, newest first.</p>
      </div>
      <Card>
        <DataTable
          rows={records}
          columns={columns}
          rowKey={(a) => a.id}
          loading={loading || childrenLoading}
          initialSort={{ key: 'sessionDate', direction: 'desc' }}
          searchPlaceholder="Search by class…"
          emptyMessage="No attendance recorded yet."
          exportFileName="child-attendance"
        />
      </Card>
    </div>
  );
}
