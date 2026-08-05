'use client';

import { Card } from '@/components/ui/Card';
import { Laptop } from 'lucide-react';
import type {
  BlendedPerformance,
  PracticalAspectRate,
  PracticalTermScore,
} from '@/lib/entities/practical-observations';

/**
 * A learner's practical lab skills, for their own report.
 *
 * ─── Why there is no percentage here ────────────────────────────────────────
 * getPracticalTermScores does compute a 0-100 figure, and this card deliberately
 * does not show it. Printed beside "Written 68%", a "Practical 74%" reads as a
 * second exam mark of equal standing and invites exactly the mental blending
 * that the design ruled out until a term of real distributions justifies a
 * weight. Once a number like that has been on a report a parent has read, it
 * cannot be unpublished.
 *
 * So this shows what was actually observed — how often, in which bands, on which
 * skills — which is both honest about what the instrument measures and more
 * useful to a parent than a figure whose scale nobody has explained.
 *
 * ─── Why it can refuse to show anything ─────────────────────────────────────
 * Below MINIMUM_ROUNDS complete rounds, getPracticalTermScores returns a null
 * score, and this renders "not enough observations yet" rather than a confident
 * summary built on two visits. Same instinct as isRankable refusing to rank an
 * unmarked submission: no number beats a misleading one, especially next to a
 * written average built from four marked papers.
 */
export function PracticalCard({
  score,
  performance,
  heading = 'Practical skills',
  /** Second person for the learner's own view, third for a parent reading about their child. */
  voice = 'self',
}: {
  score: PracticalTermScore | null;
  /** Present once the school gives practical a non-zero share of performance. */
  performance?: BlendedPerformance | null;
  heading?: string;
  voice?: 'self' | 'parent';
}) {
  const subject = voice === 'self' ? 'You have' : 'They have';

  // Nothing observed at all: render NOTHING, not an explanation.
  //
  // Until a teacher has actually scored a round, every learner in every school
  // would otherwise carry a permanent card reading "not enough observations
  // yet" — on a page parents read, for a feature they have never been told
  // about, with no way to tell that from a system that is quietly broken. An
  // absent card says the same thing honestly and says it to nobody.
  if (!score || score.roundsScored === 0) return null;

  // Observed, but not enough to publish a summary. Worth showing, because now
  // there IS something happening and the count explains itself.
  if (score.score === null) {
    return (
      <Card className="p-5">
        <Header heading={heading} />
        <p className="text-sm text-text-muted mt-3">
          Not enough observations yet. {subject} been observed in{' '}
          {roundWord(score.roundsScored)} so far this term.
        </p>
      </Card>
    );
  }

  const totals = score.perAspect.reduce(
    (acc, a) => ({
      outstanding: acc.outstanding + a.outstanding,
      moderate: acc.moderate + a.moderate,
      needsSupport: acc.needsSupport + a.needsSupport,
    }),
    { outstanding: 0, moderate: 0, needsSupport: 0 }
  );

  // Ranked by this learner's own aspect rates — self-referential, never against
  // classmates. Students are not shown their standing relative to anyone else.
  const ranked = [...score.perAspect].sort((a, b) => b.score - a.score);
  const strengths = ranked.slice(0, 3).filter((a) => a.score > 50);
  const focus = ranked
    .slice(-2)
    .filter((a) => a.score < 50)
    .reverse();

  return (
    <Card className="p-5">
      <Header heading={heading} />

      <dl className="mt-4 space-y-1.5">
        <BandLine label="Outstanding" count={totals.outstanding} tone="success" />
        <BandLine label="Moderate" count={totals.moderate} tone="neutral" />
        <BandLine label="Needs support" count={totals.needsSupport} tone="warning" />
      </dl>

      <p className="text-xs text-text-muted mt-3">
        From {roundWord(score.roundsScored)} this term.
      </p>

      {strengths.length > 0 && (
        <AspectList
          title={voice === 'self' ? 'Where you do best' : 'Where they do best'}
          aspects={strengths}
        />
      )}

      {focus.length > 0 && (
        <AspectList
          title={voice === 'self' ? 'Worth practising' : 'Worth practising'}
          aspects={focus}
        />
      )}

      {score.rubricVersions.length > 1 && (
        <p className="text-xs text-text-faint mt-4">
          The skills checklist changed during this term, so some skills have been observed
          for longer than others.
        </p>
      )}

      {/* Shown only once the school has actually given practical a share. At a
          weight of 0 the overall figure IS the written one, and printing them
          side by side as though they were different numbers would be noise. */}
      {performance && performance.weight > 0 && performance.overall !== null ? (
        <div className="mt-4 pt-3 border-t border-[#EAEAEA]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-text-secondary">Overall</span>
            <span className="text-lg font-bold text-primary-900 tabular-nums">
              {performance.overall}%
            </span>
          </div>
          <p className="text-xs text-text-faint mt-1">
            Written {performance.written}% and practical skills, counted at{' '}
            {Math.round(performance.weight * 100)}%.
          </p>
        </div>
      ) : (
        <p className="text-xs text-text-faint mt-4 pt-3 border-t border-[#EAEAEA]">
          Practical skills are observed in the lab. They are recorded separately and are not part
          of the written average.
        </p>
      )}
    </Card>
  );
}

function Header({ heading }: { heading: string }) {
  return (
    <div className="flex items-center gap-2">
      <Laptop className="w-4 h-4 text-text-muted" aria-hidden />
      <h3 className="font-semibold text-primary-900">{heading}</h3>
    </div>
  );
}

function BandLine({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: 'success' | 'neutral' | 'warning';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-[#1A7A4A]'
      : tone === 'warning'
        ? 'text-[#C47B0A]'
        : 'text-text-secondary';
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={`text-sm ${toneClass}`}>{label}</dt>
      <dd className="text-sm font-semibold text-primary-900 tabular-nums">{count}</dd>
    </div>
  );
}

function AspectList({ title, aspects }: { title: string; aspects: PracticalAspectRate[] }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-faint mb-1.5">
        {title}
      </p>
      <ul className="space-y-1">
        {aspects.map((aspect) => (
          <li key={aspect.aspect} className="text-sm text-text-secondary">
            {aspect.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "1 lesson" / "6 lessons" — the denominator that makes the counts above mean anything. */
function roundWord(rounds: number): string {
  return rounds === 1 ? '1 lesson' : `${rounds} lessons`;
}
