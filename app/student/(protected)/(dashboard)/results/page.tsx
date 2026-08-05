'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PracticalCard } from '@/components/ui/PracticalCard';
import { Award, Clock } from 'lucide-react';
import type { BlendedPerformance, PracticalTermScore } from '@/lib/entities/practical-observations';

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
  const [practical, setPractical] = useState<PracticalTermScore | null>(null);
  const [performance, setPerformance] = useState<BlendedPerformance | null>(null);
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

  // Fetched separately and failing quietly on purpose: practical skills are a
  // supplement to this page, not its subject. A learner must still see every
  // assessment they sat even if the practical lookup is unavailable.
  useEffect(() => {
    fetch('/api/practical/summary')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        setPractical(d.data);
        setPerformance(d.performance ?? null);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">My Results</h1>
      <p className="text-sm text-text-muted mb-6">
        Every assessment you&apos;ve sat, whether or not you noticed the notification.
      </p>

      {/* Above the assessment list, and visually separate from it: practical
          skills are observed in the lab, not sat as a paper, and the two must
          not read as one combined mark. */}
      <div className="mb-6">
        <PracticalCard score={practical} performance={performance} />
      </div>

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
                  {/* The mark out of 100 leads, same Ugandan report-card
                      convention as the individual result page — the raw
                      fraction is still there, just as the secondary line. */}
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary-900">
                      {a.percentage === null ? 'pending' : `${a.percentage}%`}
                    </p>
                    <p className="text-xs text-text-muted">
                      {a.totalScore ?? '—'}/{a.maxScore ?? '—'}
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
