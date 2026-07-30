'use client';

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface PopulationEntry {
  label: string;
  count: number;
}

// Keep in sync with --color-accent-dark in app/globals.css — the same single
// mark color used by the leaderboard/benchmark charts, not a new palette.
const ACCENT_DARK = '#C4952A';

interface PopulationBarChartProps {
  data: PopulationEntry[];
  height?: number;
}

/** Single-series vertical bar — one bar per class, no legend needed. */
export function PopulationBarChart({ data, height = 220 }: PopulationBarChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-text-muted">No students enrolled yet.</p>;
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16 }}>
          <CartesianGrid vertical={false} stroke="var(--color-bg-muted)" />
          <XAxis dataKey="label" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
          <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} allowDecimals={false} />
          <Tooltip
            formatter={(value) => [value, 'Students']}
            contentStyle={{ borderRadius: 8, borderColor: 'var(--color-primary-100)', fontSize: 12 }}
          />
          <Bar dataKey="count" fill={ACCENT_DARK} radius={[4, 4, 0, 0]} barSize={28}>
            <LabelList dataKey="count" position="top" style={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
