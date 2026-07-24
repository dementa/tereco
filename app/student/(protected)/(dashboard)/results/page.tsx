'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Award, Clock } from 'lucide-react';

interface Attempt {
  assessmentSystemId: string;
  title: string;
  submittedAt: string;
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  released: boolean;
}

export default function MyResultsPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/assessments/my-results')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setAttempts(d.data);
        else setError(d.message || 'Failed to load your results.');
      })
      .catch(() => setError('Network error.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">My Results</h1>
      <p className="text-sm text-text-muted mb-6">
        Every assessment you&apos;ve sat, whether or not you noticed the notification.
      </p>

      {loading ? (
        <p className="text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-error">{error}</p>
      ) : attempts.length === 0 ? (
        <Card className="p-8 text-center">
          <Award className="w-10 h-10 text-text-faint mx-auto mb-3" />
          <p className="text-text-muted">You haven&apos;t sat any assessments yet.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {attempts.map((a) => (
            <Card
              key={a.assessmentSystemId}
              hover={a.released}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5"
            >
              <div className="min-w-0">
                <h3 className="font-semibold text-primary-900 truncate">{a.title}</h3>
                <div className="flex items-center gap-1 mt-1 text-xs text-text-muted">
                  <Clock className="w-3.5 h-3.5" />
                  Sat {new Date(a.submittedAt).toLocaleDateString('en-GB')}
                </div>
              </div>

              {a.released ? (
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary-900">
                      {a.totalScore ?? '—'}
                      <span className="text-sm font-normal text-text-muted">/{a.maxScore ?? '—'}</span>
                    </p>
                    <p className="text-xs text-text-muted">
                      {a.percentage === null ? 'pending' : `${a.percentage}%`}
                    </p>
                  </div>
                  <Link href={`/student/results/${a.assessmentSystemId}`}>
                    <Button variant="outline">View result</Button>
                  </Link>
                </div>
              ) : (
                <span className="shrink-0 text-xs font-medium text-[#8A6A16] bg-[#FCF3DE] rounded-lg px-3 py-1.5">
                  Not released yet
                </span>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
