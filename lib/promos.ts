import { getEPapersForStudent, type EPaper } from "./e-papers";

/**
 * Slides for the student dashboard carousel.
 *
 * Modelled on the flash-sale strip an e-commerce app puts above the fold: the
 * learner is not looking for this, so it has to come to them. Nothing else in
 * TERECO makes a learner open the Library — the sidebar link is behind a drawer
 * on a phone, and the dashboard tile grid has never had one.
 *
 * Deliberately a KIND-TAGGED SLIDE LIST rather than a list of E-Papers, even
 * though v1 emits only one kind. The surface is worth reusing for new library
 * material, an assessment that has just opened, and a results release, and
 * every one of those is a different row in a different table. Widening a union
 * later is cheap; unpicking a carousel that hardcodes one entity is not.
 *
 * HONEST CAVEAT, recorded because it will otherwise be forgotten: nobody has
 * measured whether learners can already find the Library, so nobody knows
 * whether this is the feature or merely polish on top of it. It was built
 * because it was asked for, not because a number said it was needed.
 */

export type PromoKind = "e_paper";

export interface PromoSlide {
  /** Stable across refetches — used as the React key and the dot label. */
  id: string;
  kind: PromoKind;
  /** Small label above the title. Says what KIND of thing this is. */
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
}

/** More than this and the dots stop being a usable control. */
const MAX_SLIDES = 5;

/**
 * What to put in front of this learner right now.
 *
 * Only papers they have NOT practised yet. A promo exists to surface something
 * undiscovered; once a learner has sat a paper, the Library's E-Papers tab is
 * where they go back to it, and a carousel advertising work they have already
 * done is just noise on their own dashboard.
 *
 * Returns an empty list rather than a placeholder slide when there is nothing
 * to say. The dashboard renders nothing at all in that case — an empty promo
 * strip is worse than no promo strip.
 */
export async function getStudentPromos(studentId: string): Promise<PromoSlide[]> {
  return toPromoSlides(await getEPapersForStudent(studentId));
}

/**
 * The selection and wording rules, separated from the fetch so they can be
 * tested without a database. This is where the decisions live; the function
 * above is only plumbing.
 */
export function toPromoSlides(papers: EPaper[]): PromoSlide[] {
  return papers
    .filter((p) => p.attemptCount === 0)
    .slice(0, MAX_SLIDES)
    .map((p) => ({
      id: `e_paper:${p.id}`,
      kind: "e_paper" as const,
      eyebrow: "Practice paper",
      title: p.title,
      // States the two things that make it different from a real assessment,
      // because a learner who has only ever met timed papers will assume this
      // is one and either avoid it or rush it.
      body: `${p.questionCount} question${p.questionCount === 1 ? "" : "s"}, no timer. See the answers as soon as you finish.`,
      ctaLabel: "Try it",
      href: `/student/practice/${encodeURIComponent(p.systemId)}`,
    }));
}
