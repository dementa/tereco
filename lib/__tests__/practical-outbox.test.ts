import { describe, it, expect } from 'vitest';
import * as outbox from '@/lib/practical-outbox';
import type { Outbox, PendingEntry } from '@/lib/practical-outbox';
import type { PracticalAspect, PracticalBand } from '@/lib/entities/practical-observations';

/**
 * The outbox holds a teacher's scoring between the tap and the server
 * acknowledging it. If it loses a cell, that learner silently has no band for
 * that skill and the round never completes; if it keeps a cell it should have
 * dropped, an old band overwrites a correction. Neither shows up as an error.
 */

const tap = (learner: string, aspect: string, band: string): PendingEntry =>
  ({ lessonAttendanceId: learner, aspect, band, source: 'tap' }) as PendingEntry;

const bulk = (learner: string, aspect: string, band: string): PendingEntry =>
  ({ lessonAttendanceId: learner, aspect, band, source: 'bulk' }) as PendingEntry;

describe('stage', () => {
  it('records a tap', () => {
    const result = outbox.stage({}, [tap('amina', 'types_two_hands', 'outstanding')]);
    expect(outbox.pending(result)).toEqual([
      { lessonAttendanceId: 'amina', aspect: 'types_two_hands', band: 'outstanding', source: 'tap' },
    ]);
  });

  it('overwrites on re-tap — the later tap is what the teacher meant', () => {
    let box = outbox.stage({}, [tap('amina', 'types_two_hands', 'outstanding')]);
    box = outbox.stage(box, [tap('amina', 'types_two_hands', 'needs_support')]);
    expect(outbox.pending(box)).toHaveLength(1);
    expect(outbox.pending(box)[0].band).toBe('needs_support');
  });

  it('keeps aspects for one learner independent', () => {
    let box = outbox.stage({}, [tap('amina', 'types_two_hands', 'outstanding')]);
    box = outbox.stage(box, [tap('amina', 'helps_others', 'moderate')]);
    expect(outbox.size(box)).toBe(2);
  });

  it('does not mutate the outbox it was given', () => {
    const before: Outbox = {};
    outbox.stage(before, [tap('amina', 'types_two_hands', 'outstanding')]);
    expect(before).toEqual({});
  });
});

describe('drain', () => {
  it('removes what the server confirmed', () => {
    const entry = tap('amina', 'types_two_hands', 'outstanding');
    const box = outbox.stage({}, [entry]);
    expect(outbox.size(outbox.drain(box, [entry]))).toBe(0);
  });

  it('KEEPS a cell re-tapped while the request was in flight', () => {
    // The teacher taps Outstanding; the request leaves; they change their mind to
    // Needs support before it lands. Draining by key alone would throw away the
    // correction and leave the server's stale Outstanding standing for good.
    const sent = tap('amina', 'types_two_hands', 'outstanding');
    let box = outbox.stage({}, [sent]);
    box = outbox.stage(box, [tap('amina', 'types_two_hands', 'needs_support')]);

    const after = outbox.drain(box, [sent]);
    expect(outbox.pending(after)).toEqual([
      { lessonAttendanceId: 'amina', aspect: 'types_two_hands', band: 'needs_support', source: 'tap' },
    ]);
  });

  it('leaves other learners alone', () => {
    const amina = tap('amina', 'types_two_hands', 'outstanding');
    const brian = tap('brian', 'types_two_hands', 'moderate');
    const box = outbox.stage({}, [amina, brian]);
    expect(outbox.pending(outbox.drain(box, [amina]))).toEqual([
      { lessonAttendanceId: 'brian', aspect: 'types_two_hands', band: 'moderate', source: 'tap' },
    ]);
  });

  it('drops the learner key entirely once their last cell is confirmed', () => {
    const entry = tap('amina', 'types_two_hands', 'outstanding');
    const box = outbox.stage({}, [entry]);
    expect(outbox.drain(box, [entry])).toEqual({});
  });
});

describe('source', () => {
  it('distinguishes a chosen band from a swept one', () => {
    const box = outbox.stage({}, [
      tap('amina', 'helps_others', 'outstanding'),
      bulk('brian', 'helps_others', 'moderate'),
    ]);
    const sources = Object.fromEntries(
      outbox.pending(box).map((e) => [e.lessonAttendanceId, e.source])
    );
    expect(sources).toEqual({ amina: 'tap', brian: 'bulk' });
  });

  it('survives a round trip through storage', () => {
    // The power-cut case. If `source` were dropped in serialisation, a bulk fill
    // replayed after a reboot would come back looking like individual judgements
    // — which is precisely the distinction the column exists to preserve.
    const box = outbox.stage({}, [bulk('amina', 'helps_others', 'moderate')]);
    const revived = JSON.parse(JSON.stringify(box)) as Outbox;
    expect(outbox.pending(revived)[0].source).toBe('bulk');
  });
});

describe('overlay', () => {
  // Typed explicitly: inferred, the two entries union into a shape where
  // `helps_others` does not exist, and asserting on it fails to compile.
  const learners: { lessonAttendanceId: string; bands: Partial<Record<PracticalAspect, PracticalBand>> }[] = [
    { lessonAttendanceId: 'amina', bands: { types_two_hands: 'moderate' } },
    { lessonAttendanceId: 'brian', bands: {} },
  ];

  it('lets an unsynced tap win over what the server returned', () => {
    const box = outbox.stage({}, [tap('amina', 'types_two_hands', 'outstanding')]);
    expect(outbox.overlay(learners, box)[0].bands.types_two_hands).toBe('outstanding');
  });

  it('leaves server bands the outbox says nothing about', () => {
    const box = outbox.stage({}, [tap('amina', 'helps_others', 'outstanding')]);
    const [amina] = outbox.overlay(learners, box);
    expect(amina.bands.types_two_hands).toBe('moderate');
    expect(amina.bands.helps_others).toBe('outstanding');
  });

  it('passes untouched learners straight through', () => {
    expect(outbox.overlay(learners, {})).toEqual(learners);
  });

  it('does not mutate the learners it was given', () => {
    const box = outbox.stage({}, [tap('amina', 'types_two_hands', 'outstanding')]);
    outbox.overlay(learners, box);
    expect(learners[0].bands.types_two_hands).toBe('moderate');
  });
});

describe('outboxKey', () => {
  it('is scoped to the teacher, not just the lesson', () => {
    // Shared staffroom machines: localStorage does not die with the tab, so a key
    // without the staff id would restore one teacher's class into another's
    // roster. AssessmentTake.tsx:55 documents the same hazard for learners.
    expect(outbox.outboxKey('grace', 'lesson-1')).not.toBe(outbox.outboxKey('paul', 'lesson-1'));
    expect(outbox.outboxKey('grace', 'lesson-1')).not.toBe(outbox.outboxKey('grace', 'lesson-2'));
  });
});
