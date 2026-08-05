'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Check, Laptop, TrendingDown, Users } from 'lucide-react';

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
interface ClassAspect {
  aspect: string;
  label: string;
  doingWell: number;
  moderate: number;
  needsSupport: number;
  learners: number;
}

interface StaffRound {
  sessionId: string;
  kind: 'lesson' | 'assessment';
  classId: string;
  className: string;
  streamId: string | null;
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

  // Only classes with a finished round: a summary built on nothing would read as
  // "your class is fine" rather than "nobody has scored this yet".
  const classes = Array.from(
    new Map(done.map((r) => [`${r.classId}|${r.streamId ?? ''}`, r])).values()
  );

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
          {classes.length > 0 && <ClassSummary classes={classes} />}
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


/**
 * What to reteach next week.
 *
 * The only thing this feature gives back to the teacher who carries its cost.
 * Individual bands mostly confirm what they already know; "18 of 30 need support
 * on two-hand typing" is a different kind of statement, and it is the reason
 * scoring 287 judgements is worth anyone's afternoon.
 */
function ClassSummary({ classes }: { classes: StaffRound[] }) {
  const [selected, setSelected] = useState(classes[0]);
  // Tagged with the class it belongs to rather than cleared on switch. Deriving
  // "is this the selected class's?" at render makes showing the previous class's
  // numbers impossible by construction, and avoids a synchronous setState in an
  // effect (react-hooks/set-state-in-effect).
  const [loaded, setLoaded] = useState<{
    key: string;
    aspects: ClassAspect[];
    learners: number;
  } | null>(null);

  const key = selected ? `${selected.classId}|${selected.streamId ?? ''}` : '';
  const current = loaded?.key === key ? loaded : null;
  const loading = !!selected && !current;

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const qs = new URLSearchParams({ classId: selected.classId });
    if (selected.streamId) qs.set('streamId', selected.streamId);
    fetch(`/api/practical/class?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d.success) return;
        setLoaded({ key, aspects: d.data.aspects, learners: d.data.learners });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selected, key]);

  const aspects = current?.aspects ?? [];
  const learners = current?.learners ?? 0;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-faint mb-2">
        How your class is doing
      </p>

      {classes.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {classes.map((c) => (
            <button
              key={`${c.classId}|${c.streamId ?? ''}`}
              type="button"
              onClick={() => setSelected(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                selected?.classId === c.classId && selected?.streamId === c.streamId
                  ? 'bg-[#02465B] text-white'
                  : 'bg-bg-muted text-text-secondary hover:bg-[#EAEAEA]'
              }`}
            >
              {c.className}
            </button>
          ))}
        </div>
      )}

      <Card className="p-4">
        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : aspects.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nothing scored for {selected?.className} this term yet.
          </p>
        ) : (
          <>
            <p className="text-xs text-text-muted mb-3">
              {selected?.className} · {learners} learner{learners === 1 ? '' : 's'} scored this term.
              Weakest skill first.
            </p>
            <div className="space-y-2.5">
              {aspects.map((a) => {
                const pct = a.learners > 0 ? Math.round((a.needsSupport / a.learners) * 100) : 0;
                return (
                  <div key={a.aspect}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="text-sm text-text-primary">{a.label}</span>
                      <span className="text-xs text-text-muted shrink-0 tabular-nums">
                        {a.needsSupport} of {a.learners} need support
                      </span>
                    </div>
                    {/* One bar, showing the thing worth acting on. A stacked
                        three-band chart looks richer and answers a question
                        nobody asked. */}
                    <div className="h-1.5 rounded-full bg-bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 50 ? 'bg-[#C47B0A]' : 'bg-[#0489AE]'}`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {aspects[0] && aspects[0].needsSupport > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-text-secondary mt-3 pt-3 border-t border-[#EAEAEA]">
                <TrendingDown className="w-3.5 h-3.5 text-[#C47B0A] mt-0.5 shrink-0" aria-hidden />
                Most worth reteaching: {aspects[0].label.toLowerCase()}.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
