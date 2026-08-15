  -- TERECO: lets a super_admin exclude an assessment from the blended
  -- performance figure (written average + attendance) without hiding or
  -- deleting it. Not every assessment counted should count toward what shows
  -- up on a report card — a diagnostic, a mock, or a practice paper can exist,
  -- be sat, be marked, and still be excluded from the evaluation. Run after
  -- 28-hide-assessments.sql.
  --
  -- Additive and idempotent. Defaults to true so every existing assessment
  -- keeps counting exactly as it does today — this is an opt-out a super_admin
  -- flips per assessment, not an opt-in, and it's reversible at any time.

  alter table public.assessments
    add column if not exists include_in_evaluation boolean not null default true;
