'use client';

import { Trophy } from 'lucide-react';
import { Card } from '@/components/ui/Card';

interface TopPerformer {
  studentId: string;
  studentName: string;
  rank: number;
}

interface TopPerformersResult {
  topPerformers: TopPerformer[];
  isFeatured: boolean;
  message: string | null;
}

const MEDAL_COLORS: Record<number, string> = {
  1: 'bg-accent-dark text-white',
  2: 'bg-accent text-primary-900',
  3: 'bg-accent-mid text-primary-900',
};

interface TopPerformersCardProps {
  data: TopPerformersResult | null;
  loading?: boolean;
}

/**
 * Either the class's top 3 (when the viewer is one of them) or a private
 * encouragement message (when they're not) — never both, and never a
 * rank/position for a student outside the top 3. See
 * getTopPerformersForStudent in lib/entities/performance.ts for the rule.
 */
export function TopPerformersCard({ data, loading }: TopPerformersCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-lg bg-accent-lighter w-fit">
          <Trophy className="w-4 h-4 text-accent-dark" />
        </div>
        <p className="font-semibold text-primary-900">Top Performers</p>
      </div>

      {loading || !data ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : data.isFeatured ? (
        <ol className="space-y-2">
          {data.topPerformers.map((p) => (
            <li key={p.studentId} className="flex items-center gap-3">
              <span
                className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${
                  MEDAL_COLORS[p.rank] ?? 'bg-bg-muted text-text-secondary'
                }`}
              >
                {p.rank}
              </span>
              <span className="text-sm text-text-primary truncate">{p.studentName}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-text-secondary">{data.message}</p>
      )}
    </Card>
  );
}
