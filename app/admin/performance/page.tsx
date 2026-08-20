'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/Card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import { useIsPhone } from '@/lib/useMediaQuery';

// Keep in sync with --color-accent-dark in app/globals.css — Recharts fills
// need a resolved color, not a CSS custom property reference.
const ACCENT_DARK = '#C4952A';

interface SchoolBenchmarkEntry {
  schoolId: string;
  schoolName: string;
  studentsAssessed: number;
  submissionsCount: number;
  averagePercentage: number;
  medianPercentage: number;
  rank: number;
}

interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  assessmentsCount: number;
  averagePercentage: number;
  assessmentScore: number | null;
  behaviourScore: number | null;
  attendanceRate: number | null;
  attendanceWeight: number;
  rank: number;
}

/** A specific school's own term — for the single-school drill-down picker. */
interface Term {
  id: string;
  number: number;
  startsOn: string;
  endsOn: string;
}

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

/** One (year, number) pair across every school — for the cross-school benchmark picker. See listDistinctTerms. */
interface DistinctTerm {
  termId: string;
  academicYearLabel: string;
  number: number;
}

function isCurrentTerm(t: Term): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return t.startsOn <= today && today <= t.endsOn;
}

function termLabel(t: Term): string {
  const year = new Date(t.startsOn).getUTCFullYear();
  return `${year} Term ${t.number}${isCurrentTerm(t) ? ' (current)' : ''}`;
}

// Rank/Student/Assessment/Behaviour/Attendance/Overall — a roster shape fit
// for handing to a school as-is, so this is also what the Export button
// (CSV/Excel/PDF) hands out. exportValue keeps null-able figures numeric
// (blank when there's no data, never a literal "null"); pdfValue rounds to a
// whole percent for print, same convention as the results PDFs — the 1dp
// figure stays on screen and in CSV/Excel.
const performanceColumns: DataTableColumn<LeaderboardEntry>[] = [
  { key: 'rank', header: 'Rank', value: (e) => e.rank, sortable: true, className: 'w-14' },
  { key: 'studentName', header: 'Student', value: (e) => e.studentName, sortable: true },
  {
    key: 'assessmentScore',
    header: 'Assessment',
    value: (e) => e.assessmentScore ?? undefined,
    sortable: true,
    align: 'right',
    render: (e) => (e.assessmentScore !== null ? `${e.assessmentScore}%` : '—'),
    exportValue: (e) => e.assessmentScore,
    pdfValue: (e) => (e.assessmentScore !== null ? `${Math.round(e.assessmentScore)}%` : '—'),
  },
  {
    key: 'behaviourScore',
    header: 'Behaviour',
    value: (e) => e.behaviourScore ?? undefined,
    sortable: true,
    align: 'right',
    render: (e) => (e.behaviourScore !== null ? `${e.behaviourScore}%` : '—'),
    exportValue: (e) => e.behaviourScore,
    pdfValue: (e) => (e.behaviourScore !== null ? `${Math.round(e.behaviourScore)}%` : '—'),
  },
  {
    key: 'attendanceRate',
    header: 'Attendance',
    value: (e) => e.attendanceRate ?? undefined,
    sortable: true,
    align: 'right',
    render: (e) => (e.attendanceRate !== null ? `${e.attendanceRate}%` : '—'),
    exportValue: (e) => e.attendanceRate,
    pdfValue: (e) => (e.attendanceRate !== null ? `${Math.round(e.attendanceRate)}%` : '—'),
  },
  {
    key: 'averagePercentage',
    header: 'Overall',
    value: (e) => e.averagePercentage,
    sortable: true,
    align: 'right',
    render: (e) => <span className="font-semibold text-primary-900">{e.averagePercentage}%</span>,
    pdfValue: (e) => `${Math.round(e.averagePercentage)}%`,
  },
];

const benchmarkColumns: DataTableColumn<SchoolBenchmarkEntry>[] = [
  { key: 'rank', header: 'Rank', value: (e) => e.rank, sortable: true, className: 'w-14' },
  { key: 'schoolName', header: 'School', value: (e) => e.schoolName, sortable: true },
  { key: 'studentsAssessed', header: 'Students assessed', value: (e) => e.studentsAssessed, sortable: true, align: 'right' },
  {
    key: 'averagePercentage',
    header: 'Average',
    value: (e) => e.averagePercentage,
    sortable: true,
    align: 'right',
    render: (e) => <span className="font-semibold text-primary-900">{e.averagePercentage}%</span>,
    pdfValue: (e) => `${Math.round(e.averagePercentage)}%`,
  },
  {
    key: 'medianPercentage',
    header: 'Median',
    value: (e) => e.medianPercentage,
    sortable: true,
    align: 'right',
    render: (e) => `${e.medianPercentage}%`,
    pdfValue: (e) => `${Math.round(e.medianPercentage)}%`,
  },
];

export default function AdminPerformancePage() {
  const toast = useToast();
  const [benchmark, setBenchmark] = useState<SchoolBenchmarkEntry[]>([]);
  const [benchmarkLoading, setBenchmarkLoading] = useState(true);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const isPhone = useIsPhone();

  const [benchmarkTerms, setBenchmarkTerms] = useState<DistinctTerm[]>([]);
  const [benchmarkTermId, setBenchmarkTermId] = useState('');

  const [schoolId, setSchoolId] = useState('');
  const [drillDown, setDrillDown] = useState<LeaderboardEntry[]>([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [drillDownTerms, setDrillDownTerms] = useState<Term[]>([]);
  const [drillDownTermId, setDrillDownTermId] = useState('');
  const [schoolsDirectory, setSchoolsDirectory] = useState<SchoolDirectoryEntry[]>([]);
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');

  const loadBenchmark = useCallback(
    async (selectedTermId: string) => {
      setBenchmarkLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedTermId) params.set('termId', selectedTermId);
        const res = await fetch(`/api/admin/system/performance?${params.toString()}`);
        const data = await res.json();
        if (data.success) setBenchmark(data.data);
        else toast.error(data.message ?? 'Failed to load school benchmark.');
      } catch {
        toast.error('Network error while loading school benchmark.');
      } finally {
        setBenchmarkLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await loadBenchmark(benchmarkTermId);
    })();
    return () => controller.abort();
  }, [benchmarkTermId, loadBenchmark]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/system/terms');
        const data = await res.json();
        if (data.success) setBenchmarkTerms(data.data);
      } catch {
        // Silent — the term picker just falls back to "Default (current)".
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/directory/schools');
        const data = await res.json();
        if (data.success) setSchoolsDirectory(data.data);
      } catch {
        // Silent — the class/stream pickers just stay empty (school-wide only).
      }
    })();
  }, []);

  const loadDrillDown = useCallback(
    async (selectedSchoolId: string, selectedTermId: string, selectedClassId: string, selectedStreamId: string) => {
      setDrillDownLoading(true);
      try {
        const params = new URLSearchParams({ schoolId: selectedSchoolId });
        if (selectedTermId) params.set('termId', selectedTermId);
        if (selectedClassId) params.set('classId', selectedClassId);
        if (selectedStreamId) params.set('streamId', selectedStreamId);
        const res = await fetch(`/api/admin/system/performance?${params.toString()}`);
        const data = await res.json();
        if (data.success) setDrillDown(data.data);
        else toast.error(data.message ?? 'Failed to load school leaderboard.');
      } catch {
        toast.error('Network error while loading school leaderboard.');
      } finally {
        setDrillDownLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!schoolId) return;
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await loadDrillDown(schoolId, drillDownTermId, classId, streamId);
    })();
    return () => controller.abort();
  }, [schoolId, drillDownTermId, classId, streamId, loadDrillDown]);

  // A new school's own terms replace the old ones — any term chosen for the
  // PREVIOUS school is reset where schoolId is set (see the school <select>
  // below), since it would otherwise silently reuse an id that belongs to a
  // different school's calendar. With no school selected there is nothing to
  // fetch; the stale terms list stays unused since the picker that reads it
  // only renders once schoolId is set.
  useEffect(() => {
    if (!schoolId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/admin/system/terms?schoolId=${schoolId}`);
        const data = await res.json();
        if (!controller.signal.aborted && data.success) setDrillDownTerms(data.data);
      } catch {
        // Silent — the term picker just falls back to "Default (current)".
      }
    })();
    return () => controller.abort();
  }, [schoolId]);

  const chartHeight = Math.max(120, benchmark.length * 44);
  const drillDownClasses = schoolsDirectory.find((s) => s.id === schoolId)?.classes ?? [];
  const selectedDrillDownClass = drillDownClasses.find((c) => c.id === classId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Performance</h1>
        <p className="text-sm text-text-muted">
          Schools ranked by this term&rsquo;s performance — written assessments and attendance, blended 50/50.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-primary-900">School benchmark</h2>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={benchmarkTermId}
              onChange={(e) => setBenchmarkTermId(e.target.value)}
              className="border border-border rounded-lg px-3 py-2 text-sm"
              aria-label="Term"
            >
              <option value="">Default (current)</option>
              {benchmarkTerms.map((t) => (
                <option key={t.termId} value={t.termId}>
                  {t.academicYearLabel} Term {t.number}
                </option>
              ))}
            </select>
            <div className="flex gap-1 text-xs">
              <button
                onClick={() => setView('chart')}
                className={`px-2.5 py-1 rounded-lg ${view === 'chart' ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'}`}
              >
                Chart
              </button>
              <button
                onClick={() => setView('table')}
                className={`px-2.5 py-1 rounded-lg ${view === 'table' ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'}`}
              >
                Table
              </button>
            </div>
          </div>
        </div>

        {benchmarkLoading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : benchmark.length === 0 ? (
          <p className="text-sm text-text-muted">No marked assessments yet.</p>
        ) : view === 'chart' ? (
          <div style={{ width: '100%', height: chartHeight }}>
            <ResponsiveContainer>
              {/*
                Axis width and right margin are numeric props, so they cannot be
                done with a breakpoint. At 120px the category axis was taking
                most of a 360px screen and leaving the bars almost no room, so
                phones get a narrower axis, a smaller label and no room reserved
                for the value label (which is hidden there anyway).
              */}
              <BarChart data={benchmark} layout="vertical" margin={{ left: 8, right: isPhone ? 8 : 32 }}>
                <CartesianGrid horizontal={false} stroke="var(--color-bg-muted)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--color-text-muted)', fontSize: isPhone ? 10 : 12 }} />
                <YAxis
                  type="category"
                  dataKey="schoolName"
                  width={isPhone ? 76 : 120}
                  tick={{ fill: 'var(--color-text-secondary)', fontSize: isPhone ? 10 : 12 }}
                />
                <Tooltip
                  formatter={(value) => [`${value}%`, 'Average']}
                  contentStyle={{ borderRadius: 8, borderColor: 'var(--color-primary-100)', fontSize: 12 }}
                />
                <Bar dataKey="averagePercentage" fill={ACCENT_DARK} radius={[0, 4, 4, 0]} barSize={isPhone ? 14 : 18}>
                  {!isPhone && (
                    <LabelList dataKey="averagePercentage" position="right" formatter={(v) => `${v}%`} style={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <DataTable
            rows={benchmark}
            columns={benchmarkColumns}
            rowKey={(e) => e.schoolId}
            initialSort={{ key: 'rank', direction: 'asc' }}
            searchPlaceholder="Search by school name…"
            emptyMessage="No marked assessments yet."
            mobileTitle={(e) => e.schoolName}
            numbered
            exportFileName="school-benchmark"
          />
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-primary-900">Drill into a school</h2>
          <div className="flex flex-wrap gap-3">
            <select
              value={schoolId}
              onChange={(e) => {
                setSchoolId(e.target.value);
                setDrillDownTermId('');
                setClassId('');
                setStreamId('');
              }}
              className="border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select a school…</option>
              {benchmark.map((row) => (
                <option key={row.schoolId} value={row.schoolId}>
                  {row.schoolName}
                </option>
              ))}
            </select>
            {schoolId && (
              <select
                value={drillDownTermId}
                onChange={(e) => setDrillDownTermId(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 text-sm"
                aria-label="Term"
              >
                <option value="">Default (current)</option>
                {drillDownTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {termLabel(t)}
                  </option>
                ))}
              </select>
            )}
            {schoolId && drillDownClasses.length > 0 && (
              <select
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setStreamId('');
                }}
                className="border border-border rounded-lg px-3 py-2 text-sm"
                aria-label="Class"
              >
                <option value="">All classes</option>
                {drillDownClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            )}
            {schoolId && selectedDrillDownClass && selectedDrillDownClass.streams.length > 0 && (
              <select
                value={streamId}
                onChange={(e) => setStreamId(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 text-sm"
                aria-label="Stream"
              >
                <option value="">All streams</option>
                {selectedDrillDownClass.streams.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {!schoolId ? (
          <p className="text-sm text-text-muted">Choose a school above to see its student leaderboard.</p>
        ) : (
          <DataTable
            rows={drillDown}
            columns={performanceColumns}
            rowKey={(e) => e.studentId}
            loading={drillDownLoading}
            initialSort={{ key: 'rank', direction: 'asc' }}
            searchPlaceholder="Search by student name…"
            emptyMessage="No marked assessments yet for this school."
            mobileTitle={(e) => e.studentName}
            numbered
            exportFileName="school-performance"
          />
        )}
      </Card>
    </div>
  );
}
