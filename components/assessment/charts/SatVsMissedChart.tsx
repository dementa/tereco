'use client';

import { scaleLinear } from 'd3';
import { useElementSize } from '@/lib/useElementSize';

interface SatVsMissedChartProps {
  eligibleCount: number;
  satCount: number;
  missedCount: number;
  /** Drill down into who missed it. "Sat" isn't clickable — that's just the existing All-submissions table. */
  onMissedClick?: () => void;
}

const BAR_HEIGHT = 22;
const ROW_GAP = 14;
const LABEL_WIDTH = 64;
const CHART_HEIGHT = BAR_HEIGHT * 2 + ROW_GAP * 3;

// Sat/Missed carry a real judgment (missed is the thing worth noticing), so
// this uses the brand's status tokens rather than a generic categorical
// pair — validated together (success/warning) via the dataviz skill's
// palette checker: CVD ΔE 8.8, normal-vision ΔE 22.0, both clear the target.
const SAT_COLOR = 'var(--color-success)';
const MISSED_COLOR = 'var(--color-warning)';

export function SatVsMissedChart({ eligibleCount, satCount, missedCount, onMissedClick }: SatVsMissedChartProps) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const chartWidth = Math.max(0, width - LABEL_WIDTH - 48);

  const domainMax = Math.max(eligibleCount, satCount + missedCount, 1);
  const x = scaleLinear().domain([0, domainMax]).range([0, chartWidth]);

  const rows = [
    { label: 'Sat', value: satCount, color: SAT_COLOR, onClick: undefined },
    { label: 'Missed', value: missedCount, color: MISSED_COLOR, onClick: onMissedClick },
  ];

  return (
    <div ref={ref}>
      <p className="text-xs text-text-muted mb-2">{eligibleCount} eligible</p>
      {width > 0 && (
        <svg width={width} height={CHART_HEIGHT} role="img" aria-label="Students who sat versus missed this assessment">
          {rows.map((row, i) => {
            const barWidth = Math.max(0, x(row.value));
            const y = ROW_GAP + i * (BAR_HEIGHT + ROW_GAP);
            return (
              <g
                key={row.label}
                transform={`translate(${LABEL_WIDTH}, ${y})`}
                onClick={row.onClick}
                className={row.onClick ? 'cursor-pointer' : undefined}
              >
                <title>{`${row.label}: ${row.value}${row.onClick ? ' — click to see who' : ''}`}</title>
                {/* Recessive baseline gridline. */}
                <line x1={0} x2={chartWidth} y1={BAR_HEIGHT} y2={BAR_HEIGHT} stroke="var(--color-border)" strokeWidth={1} />
                {/* Full-row hit target — the bar itself may be too short/thin to click reliably. */}
                <rect x={0} y={0} width={chartWidth} height={BAR_HEIGHT} fill="transparent" />
                <rect
                  x={0}
                  y={0}
                  width={barWidth}
                  height={BAR_HEIGHT}
                  fill={row.color}
                  rx={4}
                  className={row.onClick ? 'opacity-90 hover:opacity-100' : undefined}
                />
                <text
                  x={-8}
                  y={BAR_HEIGHT / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-[var(--color-text-secondary)]"
                  fontSize={12}
                >
                  {row.label}
                </text>
                <text
                  x={barWidth + 8}
                  y={BAR_HEIGHT / 2}
                  dominantBaseline="middle"
                  className="fill-[var(--color-text-primary)] font-semibold"
                  fontSize={12}
                >
                  {row.value}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
