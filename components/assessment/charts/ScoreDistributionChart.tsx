'use client';

import { scaleBand, scaleLinear, max } from 'd3';
import { useElementSize } from '@/lib/useElementSize';
import type { PerformerEntry } from '@/lib/entities/assessment-analytics';

interface ScoreDistributionChartProps {
  distribution: { bucket: string; count: number }[];
  topPerformers?: PerformerEntry[];
  bottomPerformers?: PerformerEntry[];
  /** Drill down into who's in one bucket. Not called for empty buckets. */
  onBucketClick?: (bucket: string) => void;
}

const CHART_HEIGHT = 180;
const AXIS_HEIGHT = 20;
const MARKER_LANE = 18;

// A histogram's bars already encode magnitude by height, so this is one
// flat sequential-hue fill rather than a per-bar gradient — coloring each
// bar by its own count would double-encode what height already shows.
const BAR_COLOR = 'var(--color-primary-700)';
const TOP_MARKER = 'var(--color-success)';
const BOTTOM_MARKER = 'var(--color-warning)';

export function ScoreDistributionChart({
  distribution,
  topPerformers = [],
  bottomPerformers = [],
  onBucketClick,
}: ScoreDistributionChartProps) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const plotHeight = CHART_HEIGHT - AXIS_HEIGHT - MARKER_LANE;

  const xBand = scaleBand()
    .domain(distribution.map((_, i) => String(i)))
    .range([0, Math.max(0, width)])
    .paddingInner(0.15)
    .paddingOuter(0.05);
  const y = scaleLinear()
    .domain([0, Math.max(1, max(distribution, (d) => d.count) ?? 1)])
    .range([plotHeight, 0]);

  // A raw 0–100 percentage maps onto the same 10 discrete bands the bars
  // use, at the fractional position within its bucket, so a marker lines up
  // with the bar it actually falls inside rather than just the nearest tick.
  const xForPercent = (pct: number) => {
    const clamped = Math.max(0, Math.min(99.999, pct));
    const bucketIndex = Math.floor(clamped / 10);
    const fraction = (clamped - bucketIndex * 10) / 10;
    const bandStart = xBand(String(bucketIndex)) ?? 0;
    return bandStart + fraction * xBand.bandwidth();
  };

  return (
    <div ref={ref}>
      {width > 0 && (
        <svg width={width} height={CHART_HEIGHT} role="img" aria-label="Score distribution across all marked submissions">
          <g transform={`translate(0, ${MARKER_LANE})`}>
            {distribution.map((d, i) => {
              const barHeight = plotHeight - y(d.count);
              const bx = xBand(String(i)) ?? 0;
              const clickable = d.count > 0 && !!onBucketClick;
              return (
                <g
                  key={d.bucket}
                  onClick={clickable ? () => onBucketClick(d.bucket) : undefined}
                  className={clickable ? 'cursor-pointer' : undefined}
                >
                  <title>{`${d.bucket}%: ${d.count} student${d.count === 1 ? '' : 's'}${clickable ? ' — click to see who' : ''}`}</title>
                  {/* Full-height hit target — a low bar can be a few pixels tall. */}
                  <rect x={bx} y={0} width={xBand.bandwidth()} height={plotHeight} fill="transparent" />
                  <rect
                    x={bx}
                    y={y(d.count)}
                    width={xBand.bandwidth()}
                    height={Math.max(0, barHeight)}
                    fill={BAR_COLOR}
                    rx={3}
                    className={clickable ? 'opacity-90 hover:opacity-100' : undefined}
                  />
                  {d.count > 0 && (
                    <text
                      x={bx + xBand.bandwidth() / 2}
                      y={y(d.count) - 4}
                      textAnchor="middle"
                      className="fill-[var(--color-text-secondary)]"
                      fontSize={10}
                    >
                      {d.count}
                    </text>
                  )}
                  <text
                    x={bx + xBand.bandwidth() / 2}
                    y={plotHeight + 14}
                    textAnchor="middle"
                    className="fill-[var(--color-text-faint)]"
                    fontSize={9}
                  >
                    {d.bucket}
                  </text>
                </g>
              );
            })}
          </g>
          {/* Top/bottom performer reference markers, on the same x scale as the bars. */}
          {topPerformers.slice(0, 1).map((p) => (
            <polygon
              key={`top-${p.studentId}`}
              points={pointsForTriangle(xForPercent(p.percentage))}
              fill={TOP_MARKER}
            >
              <title>{`Top: ${p.studentName} — ${p.percentage}%`}</title>
            </polygon>
          ))}
          {bottomPerformers.slice(0, 1).map((p) => (
            <polygon
              key={`bottom-${p.studentId}`}
              points={pointsForTriangle(xForPercent(p.percentage))}
              fill={BOTTOM_MARKER}
            >
              <title>{`Needs support: ${p.studentName} — ${p.percentage}%`}</title>
            </polygon>
          ))}
        </svg>
      )}
      <div className="flex items-center gap-4 mt-1 text-[10px] text-text-muted">
        {topPerformers[0] && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: TOP_MARKER }} />
            Top performer
          </span>
        )}
        {bottomPerformers[0] && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: BOTTOM_MARKER }} />
            Needs support
          </span>
        )}
      </div>
    </div>
  );
}

function pointsForTriangle(cx: number): string {
  return `${cx - 5},${MARKER_LANE - 4} ${cx + 5},${MARKER_LANE - 4} ${cx},${MARKER_LANE + 4}`;
}
