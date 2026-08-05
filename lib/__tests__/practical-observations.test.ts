import { describe, it, expect } from 'vitest';
import {
  aspectsForVersion,
  summarisePractical,
  CURRENT_RUBRIC_VERSION,
  MINIMUM_ROUNDS,
  PRACTICAL_ASPECTS,
  type ObservationFact,
  type PracticalAspect,
  type PracticalBand,
} from '@/lib/entities/practical-observations';

/**
 * The practical score is attached to a child and read by their parent. When it
 * is wrong it does not throw — it produces a plausible number in the right
 * range. These tests are the only thing standing between that and a report card.
 */

let round = 0;
function observe(
  student: string,
  bands: Partial<Record<PracticalAspect, PracticalBand>>,
  opts: { roundId?: string; rubricVersion?: number } = {}
): ObservationFact[] {
  const roundId = opts.roundId ?? `round-${(round += 1)}`;
  return (Object.entries(bands) as [PracticalAspect, PracticalBand][]).map(([aspect, band]) => ({
    studentId: student,
    studentName: student,
    systemId: null,
    roundId,
    rubricVersion: opts.rubricVersion ?? CURRENT_RUBRIC_VERSION,
    aspect,
    band,
  }));
}

/** A full sweep of all seven aspects at one band, which is what a real round looks like. */
function fullRound(student: string, band: PracticalBand, roundId: string): ObservationFact[] {
  return observe(
    student,
    Object.fromEntries(PRACTICAL_ASPECTS.map((a) => [a.code, band])) as Partial<
      Record<PracticalAspect, PracticalBand>
    >,
    { roundId }
  );
}

describe('aspectsForVersion', () => {
  it('returns the full rubric for the current version', () => {
    expect(aspectsForVersion(CURRENT_RUBRIC_VERSION)).toHaveLength(7);
  });

  it('does NOT throw for an unknown version', () => {
    // Regression. An earlier version raised here, and getScorableSession calls it
    // with the version stored ON THE ROW — so the first bump of
    // CURRENT_RUBRIC_VERSION would have made every existing round 500 on open.
    // The mechanism built to survive a rubric change could not survive one.
    expect(() => aspectsForVersion(99)).not.toThrow();
    expect(aspectsForVersion(99)).toEqual(aspectsForVersion(CURRENT_RUBRIC_VERSION));
  });
});

describe('summarisePractical — basics', () => {
  it('returns nothing for no observations', () => {
    expect(summarisePractical([])).toEqual([]);
  });

  it('counts a round once however many aspects it carries', () => {
    const facts = [
      ...observe('amina', { types_two_hands: 'outstanding', helps_others: 'moderate' }, { roundId: 'r1' }),
      ...observe('amina', { types_two_hands: 'outstanding' }, { roundId: 'r2' }),
    ];
    const [amina] = summarisePractical(facts);
    expect(amina.roundsScored).toBe(2);
    expect(amina.observations).toBe(3);
  });

  it('never counts the same round twice', () => {
    // Two observations sharing a roundId are one lesson, not two. rounds is a Set
    // for exactly this reason; a counter here would inflate every denominator.
    const facts = observe('amina', { types_two_hands: 'outstanding', helps_others: 'moderate' }, { roundId: 'r1' });
    expect(summarisePractical(facts)[0].roundsScored).toBe(1);
  });

  it('scores all-outstanding at 100 and all-needs-support at 0', () => {
    const high = summarisePractical([
      ...fullRound('amina', 'outstanding', 'r1'),
      ...fullRound('amina', 'outstanding', 'r2'),
      ...fullRound('amina', 'outstanding', 'r3'),
    ]);
    const low = summarisePractical([
      ...fullRound('brian', 'needs_support', 'r1'),
      ...fullRound('brian', 'needs_support', 'r2'),
      ...fullRound('brian', 'needs_support', 'r3'),
    ]);
    expect(high[0].score).toBe(100);
    expect(low[0].score).toBe(0);
  });

  it('tallies each band per aspect', () => {
    const facts = [
      ...observe('amina', { helps_others: 'outstanding' }, { roundId: 'r1' }),
      ...observe('amina', { helps_others: 'outstanding' }, { roundId: 'r2' }),
      ...observe('amina', { helps_others: 'needs_support' }, { roundId: 'r3' }),
    ];
    const [helps] = summarisePractical(facts)[0].perAspect;
    expect(helps).toMatchObject({
      aspect: 'helps_others',
      outstanding: 2,
      moderate: 0,
      needsSupport: 1,
      observations: 3,
    });
  });

  it('reports aspects in rubric order, not alphabetically or by score', () => {
    const facts = [
      ...observe('amina', { finishes_on_time: 'outstanding', uses_lab_properly: 'moderate' }, { roundId: 'r1' }),
    ];
    expect(summarisePractical(facts)[0].perAspect.map((a) => a.aspect)).toEqual([
      'uses_lab_properly',
      'finishes_on_time',
    ]);
  });
});

describe('summarisePractical — the minimum-observations guard', () => {
  it('withholds a score below MINIMUM_ROUNDS', () => {
    const facts = Array.from({ length: MINIMUM_ROUNDS - 1 }, (_, i) =>
      fullRound('amina', 'outstanding', `r${i}`)
    ).flat();
    const [amina] = summarisePractical(facts);
    expect(amina.score).toBeNull();
    expect(amina.roundsScored).toBe(MINIMUM_ROUNDS - 1);
  });

  it('still returns the per-aspect detail while withholding the score', () => {
    // The card can honestly show what WAS seen at n=2; it just must not publish a
    // summary figure. Blanking the detail too would hide real observations.
    const facts = fullRound('amina', 'outstanding', 'r1');
    const [amina] = summarisePractical(facts);
    expect(amina.score).toBeNull();
    expect(amina.perAspect).toHaveLength(7);
  });

  it('publishes once the threshold is reached', () => {
    const facts = Array.from({ length: MINIMUM_ROUNDS }, (_, i) =>
      fullRound('amina', 'outstanding', `r${i}`)
    ).flat();
    expect(summarisePractical(facts)[0].score).toBe(100);
  });
});

describe('summarisePractical — privacy and ordering', () => {
  it('sorts by name and assigns no rank', () => {
    const facts = [
      ...fullRound('zara', 'outstanding', 'z1'),
      ...fullRound('amina', 'needs_support', 'a1'),
    ];
    const result = summarisePractical(facts);
    expect(result.map((r) => r.studentName)).toEqual(['amina', 'zara']);
    // Students must never be shown their standing against classmates. A rank
    // computed here is one leak away from a learner's own screen.
    expect(result[0]).not.toHaveProperty('rank');
    expect(result[0]).not.toHaveProperty('position');
  });
});

describe('summarisePractical — documented weaknesses', () => {
  // These encode behaviour an independent review flagged as questionable. They
  // pass because the code does this today, not because it is obviously right.
  // Changing any of them should be a decision, not a surprise.

  it('weighs a once-seen aspect as heavily as a seven-times-seen one', () => {
    // Mean-of-means, not mean-of-observations. A learner scored on six aspects
    // across many rounds plus one brand-new aspect seen once: that single
    // observation carries a full 1/7 of the final score.
    const many = Array.from({ length: 6 }, (_, i) =>
      observe('amina', { types_two_hands: 'outstanding' }, { roundId: `r${i}` })
    ).flat();
    const once = observe('amina', { helps_others: 'needs_support' }, { roundId: 'r99' });

    const [amina] = summarisePractical([...many, ...once]);
    // 6 observations of 100, 1 observation of 0 -> mean of observations would be
    // ~85.7. Mean of aspect means is 50.
    expect(amina.score).toBe(50);
  });

  it('rewards a learner who was absent on their bad days', () => {
    // Attendance is not a denominator. Present 3 times and flawless beats present
    // 8 times with a single slip, which is the opposite of what a term report
    // ought to say. MINIMUM_ROUNDS blunts this at the low end; it does not fix it.
    const rarelyPresent = summarisePractical([
      ...fullRound('amina', 'outstanding', 'a1'),
      ...fullRound('amina', 'outstanding', 'a2'),
      ...fullRound('amina', 'outstanding', 'a3'),
    ])[0];

    const alwaysPresent = summarisePractical([
      ...Array.from({ length: 7 }, (_, i) => fullRound('brian', 'outstanding', `b${i}`)).flat(),
      ...fullRound('brian', 'moderate', 'b7'),
    ])[0];

    expect(rarelyPresent.roundsScored).toBe(3);
    expect(alwaysPresent.roundsScored).toBe(8);
    expect(rarelyPresent.score).toBeGreaterThan(alwaysPresent.score as number);
  });

  it('averages over each learner\'s own aspect set, not a shared one', () => {
    // Two learners on different aspect coverage are both rendered on the same
    // 0-100 scale despite being measured by different instruments. The comment
    // that once claimed this compares "the aspects they share" was wrong.
    const narrow = summarisePractical([
      ...observe('amina', { types_two_hands: 'outstanding' }, { roundId: 'a1' }),
      ...observe('amina', { types_two_hands: 'outstanding' }, { roundId: 'a2' }),
      ...observe('amina', { types_two_hands: 'outstanding' }, { roundId: 'a3' }),
    ])[0];

    expect(narrow.perAspect).toHaveLength(1);
    expect(narrow.score).toBe(100);
  });

  it('collects every rubric version that contributed', () => {
    const facts = [
      ...fullRound('amina', 'outstanding', 'r1'),
      ...observe('amina', { types_two_hands: 'moderate' }, { roundId: 'r2', rubricVersion: 2 }),
      ...observe('amina', { types_two_hands: 'moderate' }, { roundId: 'r3', rubricVersion: 2 }),
    ];
    expect(summarisePractical(facts)[0].rubricVersions).toEqual([1, 2]);
  });
});
