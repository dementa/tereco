'use client';

import { scaleLinear } from 'd3';
import { useElementSize } from '@/lib/useElementSize';
import type { PerformerEntry } from '@/lib/entities/assessment-analytics';

interface PerformersChartProps {
  topPerformers: PerformerEntry[];
  bottomPerformers: PerformerEntry[];
}

const ROW_HEIGHT = 28;
const LABEL_WIDTH = 96;
const DOT_RADIUS = 5;

const TOP_COLOR = 'var(--color-success)';
const BOTTOM_COLOR = 'var(--color-warning)';

/**
 * A dumbbell per rank position (1st-best paired with 1st-worst, and so on)
 * rather than two independent lists — the connecting line makes the *gap*
 * between the top and bottom of the cohort legible at a glance, which two
 * separate rankings don't show on their own.
 */
export function PerformersChart({ topPerformers, bottomPerformers }: PerformersChartProps) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const rows = Math.max(topPerformers.length, bottomPerformers.length);
  const chartHeight = rows * ROW_HEIGHT + 20;
  const plotWidth = Math.max(0, width - LABEL_WIDTH * 2 - 24);

  const x = scaleLinear().domain([0, 100]).range([0, plotWidth]);

  if (rows === 0) {
    return <p className="text-sm text-text-muted">Not enough marked results yet.</p>;
  }

  return (
    <div ref={ref}>
      {width > 0 && (
        <svg width={width} height={chartHeight} role="img" aria-label="Top and bottom performers, paired by rank">
          {Array.from({ length: rows }).map((_, i) => {
            const top = topPerformers[i];
            const bottom = bottomPerformers[i];
            const y = 20 + i * ROW_HEIGHT;
            const topX = top ? x(top.percentage) : null;
            const bottomX = bottom ? x(bottom.percentage) : null;
            return (
              <g key={i} transform={`translate(${LABEL_WIDTH}, ${y})`}>
                {/* Recessive reference line for the shared scale. */}
                <line x1={0} x2={plotWidth} y1={0} y2={0} stroke="var(--color-border)" strokeWidth={1} />
                {topX !== null && bottomX !== null && (
                  <line x1={bottomX} x2={topX} y1={0} y2={0} stroke="var(--color-border-strong)" strokeWidth={2} />
                )}
                {bottom && bottomX !== null && (
                  <g>
                    <title>{`${bottom.studentName} (${bottom.className}) — ${bottom.percentage}%`}</title>
                    <circle cx={bottomX} cy={0} r={DOT_RADIUS} fill={BOTTOM_COLOR} stroke="var(--color-bg-card)" strokeWidth={2} />
                    <text
                      x={-8}
                      y={4}
                      textAnchor="end"
                      className="fill-[var(--color-text-secondary)]"
                      fontSize={10}
                    >
                      {truncate(bottom.studentName, 16)}
                    </text>
                  </g>
                )}
                {top && topX !== null && (
                  <g>
                    <title>{`${top.studentName} (${top.className}) — ${top.percentage}%`}</title>
                    <circle cx={topX} cy={0} r={DOT_RADIUS} fill={TOP_COLOR} stroke="var(--color-bg-card)" strokeWidth={2} />
                    <text x={plotWidth + 8} y={4} className="fill-[var(--color-text-secondary)]" fontSize={10}>
                      {truncate(top.studentName, 16)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <div className="flex items-center gap-4 mt-1 text-[10px] text-text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: BOTTOM_COLOR }} />
          Needs support
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: TOP_COLOR }} />
          Top performer
        </span>
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
