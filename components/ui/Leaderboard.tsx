'use client';

export interface LeaderboardRowData {
  rank: number;
  /** Present for staff/school-admin/super-admin views; omitted wherever a full roster shouldn't reach the caller. */
  name?: string;
  subtitle?: string;
  /** 0-100, drives the inline bar width. */
  value: number;
  valueLabel: string;
}

interface LeaderboardProps {
  rows: LeaderboardRowData[];
  emptyMessage?: string;
}

// Rank badges carry their numeral directly, so the close lightness steps
// between these three accent shades don't need to clear the color-only
// distinguishability bar the way a data-encoding series would.
const MEDAL_COLORS: Record<number, string> = {
  1: 'bg-accent-dark text-white',
  2: 'bg-accent text-primary-900',
  3: 'bg-accent-mid text-primary-900',
};

export function Leaderboard({ rows, emptyMessage = 'No results yet.' }: LeaderboardProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">{emptyMessage}</p>;
  }

  return (
    <ol className="space-y-1">
      {rows.map((row) => (
        <li key={row.rank} className="flex items-center gap-3 py-2">
          <span
            className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${
              MEDAL_COLORS[row.rank] ?? 'bg-bg-muted text-text-secondary'
            }`}
          >
            {row.rank}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-text-primary truncate">{row.name ?? row.subtitle ?? `Rank ${row.rank}`}</span>
              <span className="text-sm font-medium text-text-secondary shrink-0">{row.valueLabel}</span>
            </div>
            {row.name && row.subtitle && <p className="text-xs text-text-muted truncate">{row.subtitle}</p>}
            <div className="mt-1 h-1.5 rounded-full bg-bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-accent-dark"
                style={{ width: `${Math.min(100, Math.max(0, row.value))}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
