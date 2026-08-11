import { describe, it, expect } from 'vitest';
import {
  aspectsFor,
  aspectsForVersion,
  blendPerformance,
  dedupeSlots,
  summariseClass,
  summarisePractical,
  CURRENT_RUBRIC_VERSION,
  MINIMUM_ROUNDS,
  PRACTICAL_ASPECTS,
  type ObservationFact,
  type StaffRound,
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

describe('dedupeSlots — retakes are one lesson, not two', () => {
  // Not hypothetical. The live database has three slots with two sessions each
  // and identical rosters (27/27, 32/32, 18/18): the register taken twice for one
  // lesson. Shown raw, a teacher sees the same lesson twice with no way to tell
  // which to score.
  const round = (over: Partial<StaffRound>): StaffRound => ({
    sessionId: 's',
    kind: 'lesson',
    classId: 'c1',
    className: 'J1',
    streamId: null,
    slotKey: 'J1|-|2026-07-27|1',
    sessionDate: '2026-07-27',
    period: 1,
    learners: 27,
    scoredAt: null,
    aspectsDone: 0,
    aspectsTotal: 7,
    ...over,
  });

  it('collapses two sessions for the same slot into one', () => {
    const result = dedupeSlots([round({ sessionId: 'a' }), round({ sessionId: 'b' })]);
    expect(result).toHaveLength(1);
  });

  it('keeps different lessons apart', () => {
    const result = dedupeSlots([
      round({ sessionId: 'a', slotKey: 'J1|-|2026-07-27|1' }),
      round({ sessionId: 'b', slotKey: 'J2|-|2026-07-27|1' }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('prefers the copy that is already finished', () => {
    const result = dedupeSlots([
      round({ sessionId: 'unscored' }),
      round({ sessionId: 'done', scoredAt: '2026-07-27T16:00:00Z' }),
    ]);
    expect(result[0].sessionId).toBe('done');
  });

  it('prefers the copy furthest through when neither is finished', () => {
    // Never strand a teacher's partial work behind an empty duplicate.
    const result = dedupeSlots([
      round({ sessionId: 'empty', aspectsDone: 0 }),
      round({ sessionId: 'partial', aspectsDone: 4 }),
    ]);
    expect(result[0].sessionId).toBe('partial');
  });
});

describe('summarisePractical — a retaken register is still one round', () => {
  it('does not bank two rounds for one lesson', () => {
    // Both copies of a retaken slot share a roundId, because roundId is the SLOT.
    const facts = [
      ...fullRound('amina', 'outstanding', 'J1|-|2026-07-27|1'),
      ...fullRound('amina', 'outstanding', 'J1|-|2026-07-27|1'),
      ...fullRound('amina', 'outstanding', 'J1|-|2026-07-28|1'),
    ];
    expect(summarisePractical(facts)[0].roundsScored).toBe(2);
  });
});

describe('aspectsFor — assessments use a narrower rubric', () => {
  it('gives a lesson all seven skills', () => {
    expect(aspectsFor(CURRENT_RUBRIC_VERSION, 'lesson')).toHaveLength(7);
  });

  it('gives an assessment six, dropping only "helps others"', () => {
    const assessment = aspectsFor(CURRENT_RUBRIC_VERSION, 'assessment');
    expect(assessment).toHaveLength(6);
    expect(assessment).not.toContain('helps_others');
  });

  it('excludes helps_others because it inverts, not because it is minor', () => {
    // In a lesson, helping a neighbour is a virtue. Mid-paper it is malpractice.
    // Scoring it Outstanding during an assessment would record cheating as a
    // strength and feed it into the learner's performance. It is the only aspect
    // that flips meaning, which is why it is the only one excluded.
    const lesson = aspectsFor(CURRENT_RUBRIC_VERSION, 'lesson');
    const assessment = aspectsFor(CURRENT_RUBRIC_VERSION, 'assessment');
    const dropped = lesson.filter((a) => !assessment.includes(a));
    expect(dropped).toEqual(['helps_others']);
  });

  it('defaults to the lesson rubric when no context is given', () => {
    expect(aspectsFor(CURRENT_RUBRIC_VERSION)).toEqual(aspectsFor(CURRENT_RUBRIC_VERSION, 'lesson'));
  });

  it('keeps the six shared skills identical across both, so scores stay comparable', () => {
    const assessment = aspectsFor(CURRENT_RUBRIC_VERSION, 'assessment');
    const lesson = aspectsFor(CURRENT_RUBRIC_VERSION, 'lesson');
    expect(assessment.every((a) => lesson.includes(a))).toBe(true);
  });

  it('still does not throw for an unknown version in either context', () => {
    expect(() => aspectsFor(99, 'assessment')).not.toThrow();
    expect(aspectsFor(99, 'assessment')).toHaveLength(6);
  });
});

describe('a round knows which rubric it is judged against', () => {
  it('an assessment round needs six aspects to be complete, not seven', () => {
    // The completeness gate asks aspectsFor(version, kind). If it asked for the
    // full seven on an assessment, the round could never be finished: the grid
    // does not offer helps_others there, so the seventh would never arrive.
    expect(aspectsFor(CURRENT_RUBRIC_VERSION, 'assessment')).toHaveLength(6);
    expect(aspectsFor(CURRENT_RUBRIC_VERSION, 'lesson')).toHaveLength(7);
  });

  it('keeps lesson and assessment rounds in the same queue', () => {
    const result = dedupeSlots([
      {
        sessionId: 'lesson', kind: 'lesson', classId: 'c1', className: 'J1', streamId: null,
        slotKey: 'J1|-|2026-08-05|1',
        sessionDate: '2026-08-05', period: 1, learners: 30,
        scoredAt: null, aspectsDone: 0, aspectsTotal: 7,
      },
      {
        sessionId: 'paper', kind: 'assessment', classId: 'c1', className: 'J1', streamId: null,
        slotKey: 'J1|-|2026-08-05|2',
        sessionDate: '2026-08-05', period: 2, learners: 30,
        scoredAt: null, aspectsDone: 0, aspectsTotal: 6,
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.aspectsTotal).sort()).toEqual([6, 7]);
  });
});

describe('summariseClass — what to reteach next week', () => {
  const learnerOn = (name: string, aspect: PracticalAspect, bands: PracticalBand[]) =>
    bands.map((band, i) => ({
      studentId: name, studentName: name, systemId: null,
      roundId: `r${i}`, rubricVersion: CURRENT_RUBRIC_VERSION, aspect, band,
    })) as ObservationFact[];

  it('counts learners by their usual band, not by an averaged threshold', () => {
    const facts = [
      ...learnerOn('amina', 'types_two_hands', ['needs_support', 'needs_support', 'moderate']),
      ...learnerOn('brian', 'types_two_hands', ['outstanding', 'outstanding', 'moderate']),
      ...learnerOn('cynthia', 'types_two_hands', ['moderate', 'moderate', 'needs_support']),
    ];
    const [typing] = summariseClass(summarisePractical(facts));
    expect(typing).toMatchObject({
      aspect: 'types_two_hands',
      needsSupport: 1,
      moderate: 1,
      doingWell: 1,
      learners: 3,
    });
  });

  it('breaks a tie toward the worse band', () => {
    // A learner split evenly between Moderate and Needs support is one the
    // teacher should look at, not one to round up.
    const facts = learnerOn('amina', 'helps_others', ['moderate', 'needs_support']);
    const [helps] = summariseClass(summarisePractical(facts));
    expect(helps.needsSupport).toBe(1);
    expect(helps.moderate).toBe(0);
  });

  it('puts the weakest skill first, so the teaching signal leads', () => {
    const facts = [
      ...learnerOn('amina', 'types_two_hands', ['needs_support', 'needs_support']),
      ...learnerOn('amina', 'finishes_on_time', ['outstanding', 'outstanding']),
    ];
    expect(summariseClass(summarisePractical(facts)).map((a) => a.aspect)).toEqual([
      'types_two_hands',
      'finishes_on_time',
    ]);
  });

  it('returns nothing for a class nobody has scored', () => {
    expect(summariseClass([])).toEqual([]);
  });
});

describe('blendPerformance — what practical actually adds', () => {
  it('changes nothing at weight 0, which is how it ships', () => {
    expect(blendPerformance(68, 86, 0).overall).toBe(68);
  });

  it('moves the figure once the school gives it a share', () => {
    // 68 written, 86 practical, counted at 25% -> 72.5
    expect(blendPerformance(68, 86, 0.25).overall).toBe(72.5);
  });

  it('NEVER penalises a learner with no practical score', () => {
    // The important one. A learner below MINIMUM_ROUNDS has practical = null.
    // Blending null as zero would drag them to 51 for lessons their teacher
    // simply did not score — something the child did not do.
    expect(blendPerformance(68, null, 0.25).overall).toBe(68);
  });

  it('does not rank a learner on lab skills alone', () => {
    // Observations but no marked papers is not a performance figure.
    expect(blendPerformance(null, 86, 0.25).overall).toBeNull();
  });

  it('clamps a nonsense weight rather than trusting it', () => {
    expect(blendPerformance(68, 86, 5).weight).toBe(1);
    expect(blendPerformance(68, 86, -2).weight).toBe(0);
    expect(blendPerformance(68, 86, 5).overall).toBe(86);
  });

  it('rounds to one decimal, like every other percentage here', () => {
    expect(blendPerformance(67, 84, 0.3).overall).toBe(72.1);
  });
});
