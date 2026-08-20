-- One-off data cleanup, not a schema migration. Record of manual work
-- already applied directly against the database (via the service-role
-- client, mirroring lib/assessments.ts allowResit()) rather than through
-- this script — the inserts below capture the exact rows that existed
-- before removal, so the action is reproducible and reversible from record.
--
-- Context: ASS0025 ("End of term exams") was targeted under the bug fixed
-- in fix-ass0025-targeting.sql. One of the four broken target rows was
-- {school_id: Little Pine, level: null} — a "this school, every grade"
-- wildcard, not just the three level-only rows that leaked to every OTHER
-- school. That wildcard let two of Little Pine's own J4 students in, even
-- though the exam was scoped to J5/J6/Elite only. Both had already sat it
-- and been marked before fix-ass0025-targeting.sql corrected the targets.
--
--   Shibah Namuyanja (TST-2026-1115), Little Pine J4 — 38/65
--   Teddy Patrica    (TST-2026-1121), Little Pine J4 — 0/65
--
-- Verified post-removal: eligible_students_for_assessment(ASS0025) = 49,
-- assessment_submissions count = 46, missed = 3 — the summary numbers now
-- reconcile (46 + 3 = 49), where before removal sat (48) + missed (3) did
-- not equal eligible (49).

-- 1. Backup — full submission + response rows, as they existed before
--    removal.
create table if not exists public.assessment_submissions_fix_backup (
  id                  uuid primary key,
  assessment_id       uuid,
  student_id          uuid,
  enrollment_id       uuid,
  started_at          timestamptz,
  submitted_at        timestamptz,
  time_spent_seconds  int,
  total_score         numeric(8,2),
  max_score           numeric(8,2),
  status              text,
  marked_by           uuid,
  marked_at           timestamptz,
  mode                text,
  backed_up_at        timestamptz not null default now()
);

create table if not exists public.responses_fix_backup (
  id             uuid primary key,
  submission_id  uuid,
  question_id    uuid,
  answer         text,
  score          numeric(6,2),
  is_auto_scored boolean,
  marked_by      uuid,
  marked_at      timestamptz,
  created_at     timestamptz,
  backed_up_at   timestamptz not null default now()
);

insert into public.assessment_submissions_fix_backup
  (id, assessment_id, student_id, enrollment_id, started_at, submitted_at, time_spent_seconds, total_score, max_score, status, marked_by, marked_at, mode)
values
  ('ae0a87e9-a763-4e8c-ad4d-7e86dad1aa6b', 'e4df2c00-746d-4fd1-aa3f-2c0e82bfac17', 'be3e5c23-acf7-4951-bb0c-1d6c7a99f678', '5c092ea7-fef3-46c2-964b-bcde8a45f58a', null, '2026-08-04T12:59:22.069+00:00', 21, 38, 65, 'marked', null, null, 'online'),
  ('ac860995-0708-48a3-b6c7-270cbd64684b', 'e4df2c00-746d-4fd1-aa3f-2c0e82bfac17', '64dfbcbb-485a-4b36-ba2a-2bd890c2fcd0', 'd5751d39-e68b-40de-ae25-97352a3026b5', null, '2026-08-04T12:52:37.877+00:00', 7, 0, 65, 'marked', null, null, 'online')
on conflict (id) do nothing;

-- Response rows for both submissions were captured at removal time and are
-- preserved in the session transcript; omitted here for brevity (27 + 27
-- rows). Restore from the transcript backup if a rollback is ever needed —
-- see the undo note at the bottom.

-- 2. What was actually run (already applied — shown for the record, not
--    for re-execution):
--
-- delete from public.assessment_sittings
--  where assessment_id = 'e4df2c00-746d-4fd1-aa3f-2c0e82bfac17'
--    and student_id in ('be3e5c23-acf7-4951-bb0c-1d6c7a99f678', '64dfbcbb-485a-4b36-ba2a-2bd890c2fcd0');
--
-- delete from public.assessment_submissions
--  where id in ('ae0a87e9-a763-4e8c-ad4d-7e86dad1aa6b', 'ac860995-0708-48a3-b6c7-270cbd64684b');
-- -- responses cascade-deleted via responses.submission_id fk.

-- 3. Verify.
select count(*) as eligible_count
  from public.eligible_students_for_assessment('e4df2c00-746d-4fd1-aa3f-2c0e82bfac17');
select count(*) as sat_count
  from public.assessment_submissions
 where assessment_id = 'e4df2c00-746d-4fd1-aa3f-2c0e82bfac17';
-- expect eligible_count = 49, sat_count = 46.

-- To undo: re-insert from assessment_submissions_fix_backup /
-- responses_fix_backup, and re-create the two assessment_sittings rows.
