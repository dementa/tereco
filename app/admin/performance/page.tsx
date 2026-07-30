'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/Card';
import { Leaderboard, type LeaderboardRowData } from '@/components/ui/Leaderboard';
import { useToast } from '@/components/ui/ToastProvider';

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
  rank: number;
}

function toRows(entries: LeaderboardEntry[]): LeaderboardRowData[] {
  return entries.map((entry) => ({
    rank: entry.rank,
    name: entry.studentName,
    subtitle: `${entry.assessmentsCount} assessment${entry.assessmentsCount === 1 ? '' : 's'}`,
    value: entry.averagePercentage,
    valueLabel: `${entry.averagePercentage}%`,
  }));
}

export default function AdminPerformancePage() {
  const toast = useToast();
  const [benchmark, setBenchmark] = useState<SchoolBenchmarkEntry[]>([]);
  const [benchmarkLoading, setBenchmarkLoading] = useState(true);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const [schoolId, setSchoolId] = useState('');
  const [drillDown, setDrillDown] = useState<LeaderboardEntry[]>([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  const loadBenchmark = useCallback(async () => {
    setBenchmarkLoading(true);
    try {
      const res = await fetch('/api/admin/system/performance');
      const data = await res.json();
      if (data.success) setBenchmark(data.data);
      else toast.error(data.message ?? 'Failed to load school benchmark.');
    } catch {
      toast.error('Network error while loading school benchmark.');
    } finally {
      setBenchmarkLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await loadBenchmark();
    })();
    return () => controller.abort();
  }, [loadBenchmark]);

  const loadDrillDown = useCallback(
    async (selectedSchoolId: string) => {
      setDrillDownLoading(true);
      try {
        const res = await fetch(`/api/admin/system/performance?schoolId=${selectedSchoolId}`);
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
      if (!controller.signal.aborted) await loadDrillDown(schoolId);
    })();
    return () => controller.abort();
  }, [schoolId, loadDrillDown]);

  const chartHeight = Math.max(120, benchmark.length * 44);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Performance</h1>
        <p className="text-sm text-text-muted">Schools ranked by average student performance this academic year.</p>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-primary-900">School benchmark</h2>
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setView('chart')}
              className={`px-2.5 py-1 rounded-lg ${view === 'chart' ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-primary-50'}`}
            >
              Chart
            </button>
            <button
              onClick={() => setView('table')}
              className={`px-2.5 py-1 rounded-lg ${view === 'table' ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-primary-50'}`}
            >
              Table
            </button>
          </div>
        </div>

        {benchmarkLoading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : benchmark.length === 0 ? (
          <p className="text-sm text-text-muted">No marked assessments yet.</p>
        ) : view === 'chart' ? (
          <div style={{ width: '100%', height: chartHeight }}>
            <ResponsiveContainer>
              <BarChart data={benchmark} layout="vertical" margin={{ left: 8, right: 32 }}>
                <CartesianGrid horizontal={false} stroke="var(--color-bg-muted)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="schoolName"
                  width={120}
                  tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value) => [`${value}%`, 'Average']}
                  contentStyle={{ borderRadius: 8, borderColor: 'var(--color-primary-100)', fontSize: 12 }}
                />
                <Bar dataKey="averagePercentage" fill={ACCENT_DARK} radius={[0, 4, 4, 0]} barSize={18}>
                  <LabelList dataKey="averagePercentage" position="right" formatter={(v) => `${v}%`} style={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-primary-100">
                  <th className="py-2 pr-4">Rank</th>
                  <th className="py-2 pr-4">School</th>
                  <th className="py-2 pr-4">Students assessed</th>
                  <th className="py-2 pr-4">Average</th>
                  <th className="py-2 pr-4">Median</th>
                </tr>
              </thead>
              <tbody>
                {benchmark.map((row) => (
                  <tr key={row.schoolId} className="border-b border-primary-50">
                    <td className="py-2 pr-4 text-text-primary">{row.rank}</td>
                    <td className="py-2 pr-4 text-text-primary">{row.schoolName}</td>
                    <td className="py-2 pr-4 text-text-secondary">{row.studentsAssessed}</td>
                    <td className="py-2 pr-4 text-text-secondary">{row.averagePercentage}%</td>
                    <td className="py-2 pr-4 text-text-secondary">{row.medianPercentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-primary-900">Drill into a school</h2>
          <select
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="border border-primary-100 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select a school…</option>
            {benchmark.map((row) => (
              <option key={row.schoolId} value={row.schoolId}>
                {row.schoolName}
              </option>
            ))}
          </select>
        </div>

        {!schoolId ? (
          <p className="text-sm text-text-muted">Choose a school above to see its student leaderboard.</p>
        ) : drillDownLoading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <Leaderboard rows={toRows(drillDown)} emptyMessage="No marked assessments yet for this school." />
        )}
      </Card>
    </div>
  );
}
