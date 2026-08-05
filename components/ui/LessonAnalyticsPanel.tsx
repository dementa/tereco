'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';

// Keep in sync with --color-accent-dark in app/globals.css — Recharts fills
// need a resolved color, not a CSS custom property reference. Same constant
// as app/admin/performance/page.tsx.
const ACCENT_DARK = '#C4952A';

type Period = 'day' | 'week' | 'month';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

interface BreakdownRow {
  key: string;
  filed: number;
  reviewed: number;
}

interface Summary {
  window: { period: Period; from: string; to: string; label: string };
  lessonsFiled: number;
  reviewed: number;
  pendingReview: number;
  presentTotal: number;
  absentTotal: number;
  attendanceRate: number | null;
  distinctSchools: number;
  distinctClasses: number;
  distinctTeachers: number;
  trend: { date: string; filed: number }[];
  breakdown: BreakdownRow[];
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-xl font-semibold text-primary-900">{value}</p>
    </div>
  );
}

interface LessonAnalyticsPanelProps {
  /** e.g. /api/admin/system/lessons/analytics */
  endpoint: string;
  /** What the breakdown table's first column represents, e.g. "School" or "Class". */
  breakdownLabel: string;
}

/**
 * Day/week/month lesson-filing analytics, shared across the super-admin,
 * school-admin and staff views — each passes its own (already role-scoped)
 * endpoint and just the label for what the breakdown rows are.
 */
/** "2026-08-05" → "5 Aug" — compact enough for a month's worth of x-axis ticks. */
function formatTick(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function LessonAnalyticsPanel({ endpoint, breakdownLabel }: LessonAnalyticsPanelProps) {
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('day');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [trendView, setTrendView] = useState<'chart' | 'table'>('chart');

  const load = useCallback(
    async (p: Period, signal: AbortSignal) => {
      setLoading(true);
      try {
        const res = await fetch(`${endpoint}?period=${p}`, { signal });
        const data = await res.json();
        if (signal.aborted) return;
        if (data.success) setSummary(data.data);
        else toast.error(data.message ?? 'Failed to load lesson analytics.');
      } catch {
        if (!signal.aborted) toast.error('Network error while loading lesson analytics.');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [endpoint, toast]
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load(period, controller.signal);
    })();
    return () => controller.abort();
  }, [period, load]);

  // A single point (the "day" window) is a stat tile's job, not a chart's —
  // the four tiles above already cover it, so the trend section only renders
  // for week/month.
  const showTrend = (summary?.trend.length ?? 0) > 1;
  const denseTrend = (summary?.trend.length ?? 0) > 10;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-primary-900">Lesson filing</h2>
        <div className="flex gap-1 text-xs">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-2.5 py-1 rounded-lg ${
                period === p.value ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : !summary ? (
        <p className="text-sm text-text-muted">Failed to load.</p>
      ) : (
        <>
          <p className="text-xs text-text-muted mb-4">{summary.window.label}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <Stat label="Lessons filed" value={String(summary.lessonsFiled)} />
            <Stat label="Reviewed" value={String(summary.reviewed)} />
            <Stat label="Pending review" value={String(summary.pendingReview)} />
            <Stat
              label="Attendance rate"
              value={summary.attendanceRate === null ? '—' : `${Math.round(summary.attendanceRate * 100)}%`}
            />
          </div>

          {summary.lessonsFiled === 0 ? (
            <p className="text-sm text-text-muted">No lessons filed in this window.</p>
          ) : (
            <>
              {showTrend && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-text-muted">Filed per day</p>
                    <div className="flex gap-1 text-xs">
                      <button
                        onClick={() => setTrendView('chart')}
                        className={`px-2 py-0.5 rounded-lg ${
                          trendView === 'chart' ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'
                        }`}
                      >
                        Chart
                      </button>
                      <button
                        onClick={() => setTrendView('table')}
                        className={`px-2 py-0.5 rounded-lg ${
                          trendView === 'table' ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'
                        }`}
                      >
                        Table
                      </button>
                    </div>
                  </div>

                  {trendView === 'chart' ? (
                    // A single accent-dark mark falls just under 3:1 contrast
                    // against a white card (validated), so the Table view above
                    // is the required relief rather than a label on every bar —
                    // which at up to 31 points (month) would violate "never a
                    // number on every point" anyway.
                    <div style={{ width: '100%', height: 220 }}>
                      <ResponsiveContainer>
                        <BarChart data={summary.trend} margin={{ left: 0, right: 8, top: 8 }}>
                          <CartesianGrid vertical={false} stroke="var(--color-bg-muted)" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={formatTick}
                            interval={denseTrend ? Math.ceil(summary.trend.length / 8) - 1 : 0}
                            angle={denseTrend ? -40 : 0}
                            textAnchor={denseTrend ? 'end' : 'middle'}
                            height={denseTrend ? 44 : 24}
                            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                          />
                          <YAxis
                            type="number"
                            allowDecimals={false}
                            width={28}
                            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                          />
                          <Tooltip
                            labelFormatter={(label) => formatTick(String(label))}
                            formatter={(value) => [value, 'Filed']}
                            contentStyle={{ borderRadius: 8, borderColor: 'var(--color-primary-100)', fontSize: 12 }}
                          />
                          <Bar dataKey="filed" fill={ACCENT_DARK} radius={[4, 4, 0, 0]} barSize={denseTrend ? 8 : 24} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-56">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-text-muted border-b border-border">
                            <th className="py-2 pr-4">Date</th>
                            <th className="py-2 pr-4">Filed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.trend.map((point) => (
                            <tr key={point.date} className="border-b border-primary-50">
                              <td className="py-2 pr-4 text-text-primary">{formatTick(point.date)}</td>
                              <td className="py-2 pr-4 text-text-secondary">{point.filed}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-text-muted border-b border-border">
                      <th className="py-2 pr-4">{breakdownLabel}</th>
                      <th className="py-2 pr-4">Filed</th>
                      <th className="py-2 pr-4">Reviewed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.breakdown.map((row) => (
                      <tr key={row.key} className="border-b border-primary-50">
                        <td className="py-2 pr-4 text-text-primary">{row.key}</td>
                        <td className="py-2 pr-4 text-text-secondary">{row.filed}</td>
                        <td className="py-2 pr-4 text-text-secondary">{row.reviewed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}
