'use client';

import { useEffect, useState } from 'react';
import { Laptop } from 'lucide-react';

/**
 * Practical context, shown inside something a reviewer or marker is already
 * looking at.
 *
 * Two shapes, one component, because it answers the same question from two
 * places: what was actually observed about the learners involved in this?
 *
 * It renders NOTHING when there is nothing to say — an ordinary lesson, a paper
 * sat with no register taken, a round nobody scored. That is deliberate. An
 * empty chart reads as "they did badly"; an absent panel reads as "this does not
 * apply", which is the truth and is what a reviewer needs.
 */
interface ClassAspect {
  aspect: string;
  label: string;
  doingWell: number;
  moderate: number;
  needsSupport: number;
  learners: number;
}

interface RoundContext {
  kind: 'lesson' | 'assessment';
  scoredAt: string | null;
  learners: number;
  aspects: ClassAspect[];
}

interface LearnerBands {
  bands: { aspect: string; label: string; band: 'outstanding' | 'moderate' | 'needs_support' }[];
}

const BAND_LABEL: Record<string, string> = {
  outstanding: 'Outstanding',
  moderate: 'Moderate',
  needs_support: 'Needs support',
};

const BAND_TONE: Record<string, string> = {
  outstanding: 'bg-[#E8F7EF] text-[#1A7A4A]',
  moderate: 'bg-[#F5F5F5] text-[#404040]',
  needs_support: 'bg-[#FEF3DC] text-[#C47B0A]',
};

/** For a reviewer opening a lesson report: what the class did at the machines. */
export function LessonPracticalPanel({ lessonReportId }: { lessonReportId: string }) {
  const [data, setData] = useState<RoundContext | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/practical/context?lessonReportId=${encodeURIComponent(lessonReportId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setData(d.success ? d.data : null);
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [lessonReportId]);

  if (!loaded || !data) return null;

  if (!data.scoredAt) {
    return (
      <Frame>
        <p className="text-xs text-[#C47B0A]">
          Marked as a computer-lab lesson, but practical skills were never scored for its{' '}
          {data.learners} learner{data.learners === 1 ? '' : 's'}.
        </p>
      </Frame>
    );
  }

  return (
    <Frame>
      <p className="text-xs text-text-muted mb-2">
        {data.learners} learner{data.learners === 1 ? '' : 's'} scored. Weakest skill first.
      </p>
      <div className="space-y-1">
        {data.aspects.slice(0, 3).map((a) => (
          <div key={a.aspect} className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-text-secondary">{a.label}</span>
            <span className="text-xs text-text-muted shrink-0 tabular-nums">
              {a.needsSupport} of {a.learners} need support
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/**
 * For a marker with a script open: how this learner handled the machine while
 * sitting THIS paper.
 *
 * Scoped to the paper, not the term. The marker's question is not "how is this
 * child generally" — it is "was this child struggling while they sat the script
 * in front of me". A learner who needed constant support and never finished on
 * time is context a raw percentage cannot give.
 */
export function ScriptPracticalPanel({
  assessmentSystemId,
  studentId,
}: {
  assessmentSystemId: string;
  studentId: string;
}) {
  const [data, setData] = useState<LearnerBands | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ assessmentId: assessmentSystemId, studentId });
    fetch(`/api/practical/context?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setData(d.success ? d.data : null);
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [assessmentSystemId, studentId]);

  if (!loaded || !data?.bands?.length) return null;

  return (
    <Frame title="Observed while sitting this paper">
      <div className="flex flex-wrap gap-1.5">
        {data.bands.map((b) => (
          <span
            key={b.aspect}
            className={`text-xs px-2 py-1 rounded-lg ${BAND_TONE[b.band] ?? BAND_TONE.moderate}`}
            title={`${b.label}: ${BAND_LABEL[b.band] ?? b.band}`}
          >
            {b.label} · {BAND_LABEL[b.band] ?? b.band}
          </span>
        ))}
      </div>
    </Frame>
  );
}

function Frame({ title = 'Practical skills', children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#EAEAEA] bg-[#FAFAFA] p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Laptop className="w-3.5 h-3.5 text-text-muted" aria-hidden />
        <p className="text-xs font-semibold text-text-secondary">{title}</p>
      </div>
      {children}
    </div>
  );
}
