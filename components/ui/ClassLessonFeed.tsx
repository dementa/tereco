'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { BookOpen } from 'lucide-react';

type Period = 'day' | 'week' | 'month';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

interface FeedItem {
  lessonReportId: string;
  lessonDate: string;
  className: string;
  streamName: string;
  learningArea: string;
  specificSkill: string;
  approach: string;
  teacher: string;
  present: boolean;
}

interface FeedResponse {
  window: { label: string };
  items: FeedItem[];
}

/**
 * What was taught in this student's class, and whether they were there for
 * it. Deliberately lighter than the staff/admin analytics panel — no review
 * status, no challenges/support-required, since those describe managing a
 * teacher rather than informing a learner.
 */
export function ClassLessonFeed() {
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('week');
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (p: Period, signal: AbortSignal) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/student/lessons/feed?period=${p}`, { signal });
        const json = await res.json();
        if (signal.aborted) return;
        if (json.success) setData(json.data);
        else toast.error(json.message ?? 'Failed to load lessons.');
      } catch {
        if (!signal.aborted) toast.error('Network error while loading lessons.');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load(period, controller.signal);
    })();
    return () => controller.abort();
  }, [period, load]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-primary-900">What we covered</h2>
        <div className="flex gap-1 text-xs">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-2.5 py-1 rounded-lg ${
                period === p.value ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-text-muted">No lessons recorded for your class in this window.</p>
      ) : (
        <ul className="space-y-3">
          {data.items.map((item) => (
            <li key={item.lessonReportId} className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-bg-muted shrink-0 mt-0.5">
                <BookOpen className="w-3.5 h-3.5 text-primary-700" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-primary">
                  {item.learningArea}
                  {item.specificSkill ? ` — ${item.specificSkill}` : ''}
                </p>
                <p className="text-xs text-text-muted">
                  {item.lessonDate} • {item.teacher}
                </p>
              </div>
              {item.present ? (
                <Badge variant="success">Present</Badge>
              ) : (
                <Badge variant="muted">Absent</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
