import { describe, it, expect } from 'vitest';
import { autoScore, isAnswerCorrect, isAutoMarkable, type MarkableQuestion } from '@/lib/marking';

/**
 * Auto-marking is the one place in TERECO where a wrong answer is produced
 * silently and confidently. A learner sees a score, not an error, and now sees
 * it in two places — the real paper and E-Paper practice — which must agree.
 *
 * The cases below are the ones that would drift if this logic were ever copied
 * rather than imported.
 */

const q = (over: Partial<MarkableQuestion> = {}): MarkableQuestion => ({
  questionType: 'mcq',
  correctAnswer: 'Kampala',
  maxScore: 2,
  ...over,
});

describe('isAutoMarkable', () => {
  it('accepts the four objective types', () => {
    for (const t of ['mcq', 'checkbox', 'true_false', 'fill'] as const) {
      expect(isAutoMarkable(q({ questionType: t, correctAnswer: 'a' }))).toBe(true);
    }
  });

  it('rejects the types a human must read', () => {
    for (const t of ['short', 'long'] as const) {
      expect(isAutoMarkable(q({ questionType: t }))).toBe(false);
    }
  });

  // questions_answerable_ck guarantees this for new rows, but rows written
  // before that constraint existed do not carry it.
  it('rejects an objective question with no correct answer recorded', () => {
    expect(isAutoMarkable(q({ correctAnswer: undefined }))).toBe(false);
    expect(isAutoMarkable(q({ correctAnswer: '' }))).toBe(false);
  });
});

describe('isAnswerCorrect', () => {
  it('ignores surrounding space and case', () => {
    expect(isAnswerCorrect(q(), '  kampala ')).toBe(true);
  });

  it('marks a genuinely different answer wrong', () => {
    expect(isAnswerCorrect(q(), 'Entebbe')).toBe(false);
  });

  it('marks an unanswered objective question wrong, not unmarked', () => {
    expect(isAnswerCorrect(q(), '')).toBe(false);
  });

  // The distinction the results screen depends on: undefined is "no one has
  // marked this", false is "marked, and wrong". Collapsing them makes every
  // essay question render as a failure.
  it('returns undefined — not false — for a question a human must mark', () => {
    expect(isAnswerCorrect(q({ questionType: 'long' }), 'anything at all')).toBeUndefined();
  });

  describe('checkbox', () => {
    const cb = q({ questionType: 'checkbox', correctAnswer: 'Red|Blue' });

    it('accepts the same set in a different order', () => {
      expect(isAnswerCorrect(cb, 'blue|red')).toBe(true);
    });

    it('ignores empty segments from a trailing separator', () => {
      expect(isAnswerCorrect(cb, 'Red|Blue|')).toBe(true);
    });

    // All-or-nothing. A checkbox question carries one max_score and the schema
    // says nothing about what half of it would mean.
    it('gives no credit for a correct subset', () => {
      expect(isAnswerCorrect(cb, 'Red')).toBe(false);
    });

    it('gives no credit for every right choice plus a wrong one', () => {
      expect(isAnswerCorrect(cb, 'Red|Blue|Green')).toBe(false);
    });
  });
});

describe('autoScore', () => {
  it('awards the full mark, never a fraction', () => {
    expect(autoScore(q({ maxScore: 5 }), 'Kampala')).toBe(5);
  });

  it('awards zero for wrong — distinct from undefined for unmarked', () => {
    expect(autoScore(q(), 'Entebbe')).toBe(0);
    expect(autoScore(q({ questionType: 'short' }), 'Entebbe')).toBeUndefined();
  });
});
