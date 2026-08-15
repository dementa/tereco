'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import { useAuth } from '@/components/auth/AuthContext';

interface Stream {
  id: string;
  name: string;
}

interface SchoolClass {
  id: string;
  displayName: string;
  streams: Stream[];
}

interface SchoolDirectoryEntry {
  id: string;
  name: string;
  classes: SchoolClass[];
}

interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  assessmentsCount: number;
  averagePercentage: number;
  written: number;
  attendanceRate: number | null;
  attendanceWeight: number;
  rank: number;
}

// Rank/Student/Written/Attendance/Overall — a roster shape fit for handing to
// a school as-is, so this is also what the Export button (CSV/Excel/PDF)
// hands out. exportValue keeps attendanceRate numeric (blank when there's no
// data, never a literal "null"); pdfValue is the printed, %-suffixed form.
const performanceColumns: DataTableColumn<LeaderboardEntry>[] = [
  { key: 'rank', header: 'Rank', value: (e) => e.rank, sortable: true, className: 'w-14' },
  { key: 'studentName', header: 'Student', value: (e) => e.studentName, sortable: true },
  {
    key: 'written',
    header: 'Written',
    value: (e) => e.written,
    sortable: true,
    align: 'right',
    render: (e) => `${e.written}%`,
    pdfValue: (e) => `${e.written}%`,
  },
  {
    key: 'attendanceRate',
    header: 'Attendance',
    value: (e) => e.attendanceRate ?? undefined,
    sortable: true,
    align: 'right',
    render: (e) => (e.attendanceRate !== null ? `${e.attendanceRate}%` : '—'),
    exportValue: (e) => e.attendanceRate,
    pdfValue: (e) => (e.attendanceRate !== null ? `${e.attendanceRate}%` : '—'),
  },
  {
    key: 'averagePercentage',
    header: 'Overall',
    value: (e) => e.averagePercentage,
    sortable: true,
    align: 'right',
    render: (e) => <span className="font-semibold text-primary-900">{e.averagePercentage}%</span>,
    pdfValue: (e) => `${e.averagePercentage}%`,
  },
];

export default function StaffPerformancePage() {
  const toast = useToast();
  const { user } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.schoolId) return;
    (async () => {
      try {
        const res = await fetch('/api/directory/schools');
        const data = await res.json();
        if (data.success) {
          const school = (data.data as SchoolDirectoryEntry[]).find((s) => s.id === user.schoolId);
          const schoolClasses = school?.classes ?? [];
          setClasses(schoolClasses);
          if (schoolClasses.length > 0) setClassId(schoolClasses[0].id);
        } else {
          toast.error(data.message ?? 'Failed to load classes.');
        }
      } catch {
        toast.error('Network error while loading classes.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.schoolId]);

  const loadPerformance = useCallback(
    async (selectedClassId: string, selectedStreamId: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ classId: selectedClassId });
        if (selectedStreamId) params.set('streamId', selectedStreamId);
        const res = await fetch(`/api/staff/performance?${params.toString()}`);
        const data = await res.json();
        if (data.success) setEntries(data.data);
        else toast.error(data.message ?? 'Failed to load performance.');
      } catch {
        toast.error('Network error while loading performance.');
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!classId) return;
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await loadPerformance(classId, streamId);
    })();
    return () => controller.abort();
  }, [classId, streamId, loadPerformance]);

  const selectedClass = classes.find((c) => c.id === classId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Performance</h1>
        <p className="text-sm text-text-muted">
          Class leaderboard, ranked by this term&rsquo;s performance — written assessments and attendance, blended 50/50.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap gap-3">
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setStreamId('');
              }}
              className="border border-border rounded-lg px-3 py-2 text-sm"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
            {selectedClass && selectedClass.streams.length > 0 && (
              <select
                value={streamId}
                onChange={(e) => setStreamId(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">All streams</option>
                {selectedClass.streams.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <DataTable
          rows={entries}
          columns={performanceColumns}
          rowKey={(e) => e.studentId}
          loading={loading}
          initialSort={{ key: 'rank', direction: 'asc' }}
          searchPlaceholder="Search by student name…"
          emptyMessage="No marked assessments yet for this class."
          mobileTitle={(e) => e.studentName}
          exportFileName="class-performance"
        />
      </Card>
    </div>
  );
}
