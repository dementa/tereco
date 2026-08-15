'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';

interface Stream {
  id: string;
  name: string;
}

interface SchoolClass {
  id: string;
  displayName: string;
  streams: Stream[];
}

interface Term {
  id: string;
  number: number;
  startsOn: string;
  endsOn: string;
}

function isCurrentTerm(t: Term): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return t.startsOn <= today && today <= t.endsOn;
}

function termLabel(t: Term): string {
  const year = new Date(t.startsOn).getUTCFullYear();
  return `${year} Term ${t.number}${isCurrentTerm(t) ? ' (current)' : ''}`;
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

export default function SchoolAdminPerformancePage() {
  const toast = useToast();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState('');
  const [classEntries, setClassEntries] = useState<LeaderboardEntry[]>([]);
  const [classLoading, setClassLoading] = useState(false);
  const [schoolEntries, setSchoolEntries] = useState<LeaderboardEntry[]>([]);
  const [schoolLoading, setSchoolLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/school-admin/classes');
        const data = await res.json();
        if (data.success) {
          setClasses(data.data);
          if (data.data.length > 0) setClassId(data.data[0].id);
        } else {
          toast.error(data.message ?? 'Failed to load classes.');
        }
      } catch {
        toast.error('Network error while loading classes.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/school-admin/terms');
        const data = await res.json();
        if (data.success) setTerms(data.data);
      } catch {
        // Silent — the term picker just falls back to "Default (current)".
      }
    })();
  }, []);

  const loadClassLeaderboard = useCallback(
    async (selectedClassId: string, selectedStreamId: string, selectedTermId: string) => {
      setClassLoading(true);
      try {
        const params = new URLSearchParams({ classId: selectedClassId });
        if (selectedStreamId) params.set('streamId', selectedStreamId);
        if (selectedTermId) params.set('termId', selectedTermId);
        const res = await fetch(`/api/school-admin/performance?${params.toString()}`);
        const data = await res.json();
        if (data.success) setClassEntries(data.data);
        else toast.error(data.message ?? 'Failed to load class performance.');
      } catch {
        toast.error('Network error while loading class performance.');
      } finally {
        setClassLoading(false);
      }
    },
    [toast],
  );

  const loadSchoolLeaderboard = useCallback(
    async (selectedTermId: string) => {
      setSchoolLoading(true);
      try {
        const params = new URLSearchParams({ scope: 'school' });
        if (selectedTermId) params.set('termId', selectedTermId);
        const res = await fetch(`/api/school-admin/performance?${params.toString()}`);
        const data = await res.json();
        if (data.success) setSchoolEntries(data.data);
        else toast.error(data.message ?? 'Failed to load school performance.');
      } catch {
        toast.error('Network error while loading school performance.');
      } finally {
        setSchoolLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!classId) return;
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await loadClassLeaderboard(classId, streamId, termId);
    })();
    return () => controller.abort();
  }, [classId, streamId, termId, loadClassLeaderboard]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await loadSchoolLeaderboard(termId);
    })();
    return () => controller.abort();
  }, [termId, loadSchoolLeaderboard]);

  const selectedClass = classes.find((c) => c.id === classId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 mb-1">Performance</h1>
          <p className="text-sm text-text-muted">
            Ranked by this term&rsquo;s performance — written assessments and attendance, blended 50/50.
          </p>
        </div>
        <select
          value={termId}
          onChange={(e) => setTermId(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm"
          aria-label="Term"
        >
          <option value="">Default (current)</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {termLabel(t)}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-primary-900">Class leaderboard</h2>
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
          rows={classEntries}
          columns={performanceColumns}
          rowKey={(e) => e.studentId}
          loading={classLoading}
          initialSort={{ key: 'rank', direction: 'asc' }}
          searchPlaceholder="Search by student name…"
          emptyMessage="No marked assessments yet for this class."
          mobileTitle={(e) => e.studentName}
          exportFileName="class-performance"
        />
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-primary-900 mb-4">Whole school</h2>
        <DataTable
          rows={schoolEntries}
          columns={performanceColumns}
          rowKey={(e) => e.studentId}
          loading={schoolLoading}
          initialSort={{ key: 'rank', direction: 'asc' }}
          searchPlaceholder="Search by student name…"
          emptyMessage="No marked assessments yet for this school."
          mobileTitle={(e) => e.studentName}
          exportFileName="school-performance"
        />
      </Card>
    </div>
  );
}
