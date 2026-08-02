'use client';

import { useState } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

interface GenderBreakdownEntry {
  gender: 'male' | 'female' | 'unspecified';
  count: number;
}

// Validated with the dataviz skill's palette script against the app's actual
// theme (app/globals.css): primary-400 + accent-dark pass lightness band,
// chroma floor, CVD separation (ΔE 20.4/22.3), and the normal-vision floor
// (ΔE 25.3) as a categorical pair. "unspecified" is a muted neutral, not a
// third validated hue — a residual/unknown bucket reads as distinct-by-being-
// muted rather than needing to clear the same separation bar as a real category.
const COLORS: Record<GenderBreakdownEntry['gender'], string> = {
  male: '#0489AE',
  female: '#C4952A',
  unspecified: '#A3A3A3',
};

const LABELS: Record<GenderBreakdownEntry['gender'], string> = {
  male: 'Male',
  female: 'Female',
  unspecified: 'Unspecified',
};

interface GenderDonutChartProps {
  data: GenderBreakdownEntry[];
}

export function GenderDonutChart({ data }: GenderDonutChartProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return <p className="text-sm text-text-muted">No students enrolled yet.</p>;
  }

  const chartData = data.map((d) => ({
    ...d,
    label: LABELS[d.gender],
    percent: Math.round((d.count / total) * 1000) / 10,
  }));

  return (
    <div>
      <div className="flex justify-end mb-2">
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

      {view === 'chart' ? (
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="label"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={2}
                label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.gender} fill={COLORS[entry.gender]} stroke="var(--color-bg-card)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [`${value} (${name})`, 'Students']} />
              <Legend verticalAlign="bottom" height={28} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border">
              <th className="py-2 pr-4">Gender</th>
              <th className="py-2 pr-4">Students</th>
              <th className="py-2 pr-4">Share</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((d) => (
              <tr key={d.gender} className="border-b border-primary-50">
                <td className="py-2 pr-4 text-text-primary">{d.label}</td>
                <td className="py-2 pr-4 text-text-secondary">{d.count}</td>
                <td className="py-2 pr-4 text-text-secondary">{d.percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
