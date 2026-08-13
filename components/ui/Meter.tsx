'use client';

interface MeterProps {
  label: string;
  value: number;
  max: number;
  /** Defaults to "value / max". */
  formatValue?: (value: number, max: number) => string;
}

/**
 * A labeled progress row — label in small caps, "current / total" right-
 * aligned, a thin fill bar underneath. The fill/track pair is the same
 * idiom already proven in Leaderboard.tsx's ranked rows, pulled out here so
 * a plain metered stat (not tied to a ranked list) can reuse it too.
 */
export function Meter({ label, value, max, formatValue }: MeterProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
        <span className="text-xs font-medium text-text-secondary shrink-0">
          {formatValue ? formatValue(value, max) : `${value} / ${max}`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-accent-dark" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
