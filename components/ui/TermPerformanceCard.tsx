'use client';

import { Card } from '@/components/ui/Card';
import { ClipboardCheck } from 'lucide-react';
import type { StudentTermPerformance } from '@/lib/entities/performance';

/**
 * A learner's current-term blended performance — written assessments and
 * attendance, counted equally. Separate from PracticalCard's "Overall" on
 * purpose: that one is the school-configured practical weight and can sit at
 * 0, while this blend is always on. Two different business rules, so they
 * stay two different numbers rather than being merged into one that means
 * neither thing clearly.
 */
export function TermPerformanceCard({
  performance,
  /** Second person for the learner's own view, third for a parent reading about their child. */
  voice = 'self',
}: {
  performance: StudentTermPerformance | null;
  voice?: 'self' | 'parent';
}) {
  // No current term for the school, or nothing marked yet this term: render
  // nothing rather than a confusing zero.
  if (!performance) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-text-muted" aria-hidden />
        <h3 className="font-semibold text-primary-900">This term&apos;s performance</h3>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3">
        <span className="text-sm text-text-secondary">Overall</span>
        <span className="text-lg font-bold text-primary-900 tabular-nums">{performance.overall}%</span>
      </div>

      <p className="text-xs text-text-faint mt-1">
        {performance.attendanceRate !== null
          ? `Written ${performance.written}% and attendance ${performance.attendanceRate}%, counted equally.`
          : voice === 'self'
            ? `Written ${performance.written}%. No attendance recorded yet this term, so only your written score counts.`
            : `Written ${performance.written}%. No attendance recorded yet this term, so only their written score counts.`}
      </p>
    </Card>
  );
}
