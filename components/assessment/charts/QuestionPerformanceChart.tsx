'use client';

import { scaleLinear } from 'd3';
import { useElementSize } from '@/lib/useElementSize';
import type { QuestionStat } from '@/lib/entities/assessment-analytics';

interface QuestionPerformanceChartProps {
  questions: QuestionStat[];
  /** Drill down into every student's answer for one question. Not called for questions with zero responses. */
  onQuestionClick?: (questionId: string) => void;
}

const BAR_HEIGHT = 16;
const ROW_GAP = 8;
const LABEL_WIDTH = 40;

// A question's average IS a pass/fail signal against the 50% reference, so
// this wears status tokens rather than a sequential magnitude ramp — the
// two jobs don't mix in one chart (dataviz skill's collision rule). Pair
// validated: CVD ΔE 7.3 (deutan, floor band) with normal-vision ΔE 26.1 —
// legal given the direct % labels every bar already carries as secondary
// encoding.
const WEAK_COLOR = 'var(--color-error)';
const STRONG_COLOR = 'var(--color-success)';
const UNMARKED_COLOR = 'var(--color-border-strong)';

export function QuestionPerformanceChart({ questions, onQuestionClick }: QuestionPerformanceChartProps) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const chartWidth = Math.max(0, width - LABEL_WIDTH - 40);
  const chartHeight = questions.length * (BAR_HEIGHT + ROW_GAP) + ROW_GAP;

  const x = scaleLinear().domain([0, 100]).range([0, chartWidth]);

  if (questions.length === 0) {
    return <p className="text-sm text-text-muted">No questions to score yet.</p>;
  }

  return (
    <div ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={chartHeight}
          role="img"
          aria-label="Average performance per question, sorted worst to best"
        >
          {/* Reference line at the 50% pass threshold. */}
          <line
            x1={LABEL_WIDTH + x(50)}
            x2={LABEL_WIDTH + x(50)}
            y1={0}
            y2={chartHeight}
            stroke="var(--color-border-strong)"
            strokeWidth={1}
            strokeDasharray="2,2"
          />
          {questions.map((q, i) => {
            const pct = q.averagePercent;
            const barWidth = pct === null ? 0 : Math.max(0, x(pct));
            const y = ROW_GAP + i * (BAR_HEIGHT + ROW_GAP);
            const color = pct === null ? UNMARKED_COLOR : pct < 50 ? WEAK_COLOR : STRONG_COLOR;
            const clickable = q.respondedCount > 0 && !!onQuestionClick;
            return (
              <g
                key={q.questionId}
                transform={`translate(${LABEL_WIDTH}, ${y})`}
                onClick={clickable ? () => onQuestionClick(q.questionId) : undefined}
                className={clickable ? 'cursor-pointer' : undefined}
              >
                <title>{`${q.code}: ${q.questionText || 'Untitled'} — ${pct === null ? 'not yet marked' : `${pct}% average`}${clickable ? ' — click to see every answer' : ''}`}</title>
                <line x1={0} x2={chartWidth} y1={BAR_HEIGHT} y2={BAR_HEIGHT} stroke="var(--color-border)" strokeWidth={1} />
                {/* Full-row hit target — an unmarked/weak bar can be very short. */}
                <rect x={0} y={0} width={chartWidth} height={BAR_HEIGHT} fill="transparent" />
                <rect
                  x={0}
                  y={0}
                  width={barWidth}
                  height={BAR_HEIGHT}
                  fill={color}
                  rx={3}
                  className={clickable ? 'opacity-90 hover:opacity-100' : undefined}
                />
                <text
                  x={-8}
                  y={BAR_HEIGHT / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-[var(--color-text-secondary)]"
                  fontSize={11}
                >
                  {q.code}
                </text>
                <text
                  x={barWidth + 6}
                  y={BAR_HEIGHT / 2}
                  dominantBaseline="middle"
                  className="fill-[var(--color-text-primary)]"
                  fontSize={11}
                >
                  {pct === null ? 'unmarked' : `${pct}%`}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
