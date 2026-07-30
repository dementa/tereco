'use client';

interface SparklineProps {
  /** 0-100 values, oldest first. */
  points: number[];
  width?: number;
  height?: number;
}

/**
 * A trend trace under a stat number — closer to a hero-number companion than
 * a full chart, so it's hand-rolled SVG rather than pulling in Recharts.
 * Single series: one accent-colored line, no axes/legend/grid.
 */
export function Sparkline({ points, width = 96, height = 28 }: SparklineProps) {
  if (points.length < 2) return null;

  const max = Math.max(...points, 100);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const toY = (v: number) => height - ((v - min) / range) * height;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${i * stepX},${toY(p)}`).join(' ');
  const lastX = (points.length - 1) * stepX;
  const lastY = toY(points[points.length - 1]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={path} fill="none" stroke="#C4952A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={3} fill="#C4952A" />
    </svg>
  );
}
