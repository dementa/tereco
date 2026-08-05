'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Check, Laptop, Users } from 'lucide-react';

/**
 * The teacher's practical scoring queue.
 *
 * This page exists because the scoring screen is /staff/practical/[sessionId]
 * and, until now, nothing in the application knew a session id. The feature was
 * complete and unreachable: the only reference anywhere was inside the nightly
 * cron, and only when a teacher happened to have exactly one pending round.
 * Meanwhile the parent-facing card was already live, so every learner in every
 * school would have read "not enough observations yet" forever while the whole
 * thing looked like it was working.
 */
interface StaffRound {
  sessionId: string;
  kind: 'lesson' | 'assessment';
  sessionDate: string;
  period: number;
  learners: number;
  scoredAt: string | null;
  aspectsDone: number;
  aspectsTotal: number;
}

export default function PracticalRoundsPage() {
  const router = useRouter();
  const [rounds, setRounds] = useState<StaffRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/practical')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setRounds(d.data);
        else setError(d.message || 'Could not load your lessons.');
      })
      .catch(() => setError('Network error.'))
      .finally(() => setLoading(false));
  }, []);

  const pending = rounds.filter((r) => !r.scoredAt);
  const done = rounds.filter((r) => r.scoredAt);

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Practical Skills</h1>
      <p className="text-sm text-text-muted mb-6">
        Score the learners you had in the lab, and the ones you invigilated. Take the
        register first — the roster comes from it.
      </p>

      {loading ? (
        <p className="text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-error">{error}</p>
      ) : rounds.length === 0 ? (
        <Card className="p-8 text-center">
          <Laptop className="w-10 h-10 text-text-faint mx-auto mb-3" />
          <p className="text-text-muted">Nothing to score yet.</p>
          <p className="text-sm text-text-faint mt-1">
            Take attendance for a lesson and it will appear here afterwards.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <Section title="Waiting to be scored" rounds={pending} router={router} />
          )}
          {done.length > 0 && (
            <Section title="Finished" rounds={done} router={router} muted />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  rounds,
  router,
  muted = false,
}: {
  title: string;
  rounds: StaffRound[];
  router: ReturnType<typeof useRouter>;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-faint mb-2">
        {title}
      </p>
      <div className="grid gap-2.5">
        {rounds.map((round) => (
          <Card
            key={round.sessionId}
            hover
            className="p-4 cursor-pointer"
            // Finished rounds stay openable: they are editable until the term
            // closes, and a teacher who spots a mistake needs a way back in.
          >
            <button
              type="button"
              onClick={() => router.push(`/staff/practical/${round.sessionId}`)}
              className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
            >
              <div className="min-w-0">
                <p className="font-semibold text-primary-900">
                  {new Date(round.sessionDate).toLocaleDateString('en-GB')} · Period {round.period}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {round.learners} learner{round.learners === 1 ? '' : 's'} present
                  </span>
                  {/* An assessment round is judged on six skills, not seven —
                      "helps others" is malpractice mid-paper. Say so here so the
                      shorter list is expected rather than looking like a bug. */}
                  {round.kind === 'assessment' && (
                    <span className="px-1.5 py-0.5 rounded bg-bg-muted text-text-secondary font-medium">
                      Assessment · 6 skills
                    </span>
                  )}
                </div>
              </div>

              {muted ? (
                <span className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-[#1A7A4A]">
                  <Check className="w-3.5 h-3.5" />
                  Scored
                </span>
              ) : (
                <span className="shrink-0 text-xs font-medium text-text-secondary tabular-nums">
                  {round.aspectsDone}/{round.aspectsTotal} skills
                </span>
              )}
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
