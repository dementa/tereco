import { describe, it, expect } from 'vitest';
import { toPromoSlides } from '@/lib/promos';
import type { EPaper } from '@/lib/e-papers';

/**
 * The carousel is the only thing on a learner's dashboard pointing at something
 * they did not come here to do. What it chooses to show is the whole feature —
 * and it is chosen from data, silently, with no error possible if the rule is
 * wrong. These cover the rule.
 */

const paper = (over: Partial<EPaper> = {}): EPaper => ({
  id: 'p1',
  systemId: 'ASS0001',
  title: 'End of Term 2 Computer Studies',
  description: '',
  timeLimitMinutes: 40,
  ePaperAt: '2026-08-01T00:00:00Z',
  questionCount: 12,
  attemptCount: 0,
  ...over,
});

describe('toPromoSlides', () => {
  it('offers a paper the learner has never practised', () => {
    expect(toPromoSlides([paper()])).toHaveLength(1);
  });

  // A promo exists to surface something undiscovered. Advertising work they
  // have already done is noise on their own dashboard.
  it('drops a paper the learner has already practised', () => {
    expect(toPromoSlides([paper({ attemptCount: 1 })])).toEqual([]);
  });

  it('returns nothing rather than a placeholder when there is nothing to say', () => {
    expect(toPromoSlides([])).toEqual([]);
  });

  // More than five and the dots stop being a usable control.
  it('caps the strip at five slides', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      paper({ id: `p${i}`, systemId: `ASS000${i}` })
    );
    expect(toPromoSlides(many)).toHaveLength(5);
  });

  it('preserves the order it was given — newest first comes from the query', () => {
    const slides = toPromoSlides([
      paper({ id: 'new', systemId: 'ASS0009', title: 'Newest' }),
      paper({ id: 'old', systemId: 'ASS0001', title: 'Oldest' }),
    ]);
    expect(slides.map((s) => s.title)).toEqual(['Newest', 'Oldest']);
  });

  it('links to the practice screen by system id, not uuid', () => {
    const [slide] = toPromoSlides([paper({ id: 'uuid-not-this', systemId: 'ASS0042' })]);
    expect(slide.href).toBe('/student/practice/ASS0042');
  });

  it('says there is no timer, because every other paper a learner meets has one', () => {
    const [slide] = toPromoSlides([paper()]);
    expect(slide.body).toContain('no timer');
  });

  it('counts a single question without a stray plural', () => {
    const [slide] = toPromoSlides([paper({ questionCount: 1 })]);
    expect(slide.body).toContain('1 question,');
  });

  // The id is a React key across refetches and must not collide with a future
  // slide kind that happens to wrap the same row.
  it('namespaces the slide id by kind', () => {
    const [slide] = toPromoSlides([paper({ id: 'abc' })]);
    expect(slide.id).toBe('e_paper:abc');
  });
});
