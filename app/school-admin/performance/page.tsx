'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Leaderboard, type LeaderboardRowData } from '@/components/ui/Leaderboard';
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

function toRows(entries: LeaderboardEntry[]): LeaderboardRowData[] {
  return entries.map((entry) => ({
    rank: entry.rank,
    name: entry.studentName,
    subtitle:
      entry.attendanceRate !== null
        ? `${entry.written}% written, ${entry.attendanceRate}% attendance`
        : `${entry.assessmentsCount} assessment${entry.assessmentsCount === 1 ? '' : 's'} · no attendance recorded yet`,
    value: entry.averagePercentage,
    valueLabel: `${entry.averagePercentage}%`,
  }));
}

export default function SchoolAdminPerformancePage() {
  const toast = useToast();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
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

  const loadClassLeaderboard = useCallback(
    async (selectedClassId: string, selectedStreamId: string) => {
      setClassLoading(true);
      try {
        const params = new URLSearchParams({ classId: selectedClassId });
        if (selectedStreamId) params.set('streamId', selectedStreamId);
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

  const loadSchoolLeaderboard = useCallback(async () => {
    setSchoolLoading(true);
    try {
      const res = await fetch('/api/school-admin/performance?scope=school');
      const data = await res.json();
      if (data.success) setSchoolEntries(data.data);
      else toast.error(data.message ?? 'Failed to load school performance.');
    } catch {
      toast.error('Network error while loading school performance.');
    } finally {
      setSchoolLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!classId) return;
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await loadClassLeaderboard(classId, streamId);
    })();
    return () => controller.abort();
  }, [classId, streamId, loadClassLeaderboard]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await loadSchoolLeaderboard();
    })();
    return () => controller.abort();
  }, [loadSchoolLeaderboard]);

  const selectedClass = classes.find((c) => c.id === classId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Performance</h1>
        <p className="text-sm text-text-muted">
          Ranked by this term&rsquo;s performance — written assessments and attendance, blended 50/50.
        </p>
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

        {classLoading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <Leaderboard rows={toRows(classEntries)} emptyMessage="No marked assessments yet for this class." />
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-primary-900 mb-4">Whole school</h2>
        {schoolLoading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <Leaderboard rows={toRows(schoolEntries)} emptyMessage="No marked assessments yet for this school." />
        )}
      </Card>
    </div>
  );
}
