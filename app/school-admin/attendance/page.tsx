'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';

interface AttendanceSession {
  id: string;
  className: string;
  streamName: string;
  sessionDate: string;
  period: number;
  present: number;
  absent: number;
  takenAt: string;
  attached: boolean;
  lessonReportReference: string | null;
}

const columns: DataTableColumn<AttendanceSession>[] = [
  { key: 'sessionDate', header: 'Date', value: (s) => s.sessionDate },
  { key: 'className', header: 'Class', value: (s) => [s.className, s.streamName].filter(Boolean).join(' ') },
  { key: 'period', header: 'Period', value: (s) => String(s.period) },
  { key: 'present', header: 'Present', value: (s) => String(s.present) },
  { key: 'absent', header: 'Absent', value: (s) => String(s.absent) },
  {
    key: 'attached',
    header: 'Lesson report',
    value: (s) => (s.attached ? s.lessonReportReference ?? 'Attached' : 'Not attached'),
    render: (s) =>
      s.attached ? (
        <Badge variant="success">{s.lessonReportReference ?? 'Attached'}</Badge>
      ) : (
        <Badge variant="muted">Not attached</Badge>
      ),
  },
];

export default function SchoolAdminAttendancePage() {
  const toast = useToast();
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/school-admin/attendance');
        const data = await res.json();
        if (cancelled) return;
        if (data.success) setSessions(data.data);
        else toast.error(data.message ?? 'Failed to load attendance.');
      } catch {
        if (!cancelled) toast.error('Network error while loading attendance.');
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
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Attendance</h1>
        <p className="text-sm text-text-muted">
          Every class&apos;s attendance sessions, newest first. Read-only — attendance is taken by staff.
        </p>
      </div>
      <Card>
        <DataTable
          rows={sessions}
          columns={columns}
          rowKey={(s) => s.id}
          loading={loading}
          initialSort={{ key: 'sessionDate', direction: 'desc' }}
          searchPlaceholder="Search by class…"
          emptyMessage="No attendance sessions recorded yet."
          exportFileName="school-attendance"
        />
      </Card>
    </div>
  );
}
