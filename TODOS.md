# TODOS

Deferred work with enough context to pick up cold. Add items here rather than losing the
reasoning in a commit message or a chat log.

---

## Decide whether aspects 4 and 5 are one aspect or two

**What:** The practical rubric currently lists both *"navigates the computer independently"*
(aspect 4) and *"works independently without needing teacher support"* (aspect 5). Decide
whether these stay separate, get merged into one, or get sharpened so they measure genuinely
different things.

**Why:** As worded, the two ask a teacher nearly the same question. That costs one of only
seven rubric slots, and the two will correlate so tightly that the practical score effectively
double-counts independence while under-weighting everything else. A teacher scoring 41 learners
twice on what feels like the same thing is also the kind of friction that makes people stop.

**Context:** Aspect 5 was originally specified as *"child requires support from the teacher most
of the time"*. That wording ran opposite in polarity to the other six, which broke both the
aggregation (a learner needing constant help would score *higher*) and the UI (a button marked
"Outstanding" against "requires support most of the time" is unanswerable). It was reworded to
positive polarity during the 2026-08-05 eng review. The overlap with aspect 4 is a side effect
of that fix, not an original flaw.

One possible sharpening: aspect 4 is about *navigation skill* (can they find and operate what
they need), aspect 5 is about *help-seeking behaviour* (do they attempt before asking). Those are
genuinely different and both useful for badges later. If that distinction holds, reword both to
make it explicit rather than merging.

**Depends on / blocked by:** Nothing blocks deciding. But it should be settled **before** the
`21-practical-observations.sql` migration lands, because the aspect codes are a Postgres enum and
`ALTER TYPE ... ADD VALUE` is append-only — a code chosen now cannot be cleanly removed later.
Sponsor sign-off needed, since the seven aspects were specified by the project sponsor.

**Blocks:** T1 (schema migration), if you want it resolved first.

---

## Considered and declined (2026-08-05 eng review)

Recorded so they are not re-proposed without new information:

- **`practical_weight` blending** — deferred to the design doc's own open questions rather than
  a TODO. Revisit after one term of real band distributions.
- **Playwright E2E and the outstanding Vercel restyle browser check** — deferred; needs an
  environment with Supabase access.
- **`staff_assignments` dead table** — flagged, not tracked here.
