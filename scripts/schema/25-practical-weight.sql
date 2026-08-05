-- TERECO: how much practical skills count toward performance. Run after
-- 24-assessment-registers.sql.
--
-- Additive and idempotent.
--
-- ─── What this is for ───────────────────────────────────────────────────────
-- The requirement was that practical observations "contribute to the performance
-- of the child". Until now they contributed by being VISIBLE beside the written
-- average, not by moving it — which is a weaker claim than the one that was made,
-- and worth closing.
--
-- ─── Why it ships at zero ───────────────────────────────────────────────────
-- practical_observations currently holds no rows. Any weight chosen today would
-- be invented, and a blended figure cannot be unblended once a parent has read it
-- on a report. Shipping the mechanism at 0 means turning it on later is a
-- settings change rather than a release, and the decision can be made against a
-- term of real distributions instead of a guess.
--
-- There is a specific thing to look for before raising it. If teachers lean on
-- the "mark the remaining N as Moderate" button, practical scores cluster at
-- exactly 50 — and a weight applied to a column of 50s does not measure anything,
-- it just drags every learner toward the middle. practical_observations.source
-- answers that: check the tap-to-bulk ratio BEFORE setting this above zero.
--
-- Per school rather than global: four schools with very different class sizes
-- (25 to 64 learners) will not reach trustworthy data at the same time, and one
-- should not have to wait for another.
alter table public.schools
  add column if not exists practical_weight numeric(3, 2) not null default 0;

alter table public.schools
  drop constraint if exists schools_practical_weight_ck;
alter table public.schools
  add constraint schools_practical_weight_ck check (
    practical_weight >= 0 and practical_weight <= 1
  );

comment on column public.schools.practical_weight is
  'Share of the overall performance figure taken from practical skills, 0..1. '
  'Ships at 0: the mechanism is live and switched off until a term of real '
  'distributions justifies a number. Check practical_observations.source for '
  'bulk-filling before raising it.';

notify pgrst, 'reload schema';
