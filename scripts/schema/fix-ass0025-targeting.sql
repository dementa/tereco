-- One-off data fix, not a schema migration. ASS0025's audience was set as
-- 4 independent target rows: {Little Pine, any level}, {any school, J5},
-- {any school, J6}, {any school, Elite/J7} — each row is OR'd against the
-- others and only ANDs the fields it itself carries, so the 3 level-only
-- rows matched that grade at EVERY school, not just Little Pine. Actual
-- eligible count was 462; the intended audience (Little Pine's J5+J6+Elite
-- only) is 49.
--
-- Root cause fixed in components/assessment/AssessmentSetupPanel.tsx
-- (addSchoolLevelTarget no longer clears the school field after each add).
-- This script repairs the one assessment already affected.

-- 1. Backup.
create table if not exists public.assessment_targets_fix_backup (
  id            uuid primary key,
  assessment_id uuid,
  school_id     uuid,
  level         int,
  class_id      uuid,
  student_id    uuid,
  backed_up_at  timestamptz not null default now()
);

insert into public.assessment_targets_fix_backup (id, assessment_id, school_id, level, class_id, student_id)
select id, assessment_id, school_id, level, class_id, student_id
  from public.assessment_targets
 where assessment_id = (select id from public.assessments where system_id = 'ASS0025');

-- 2. Replace the 4 broken rows with 3 correctly-scoped ones.
delete from public.assessment_targets
 where assessment_id = (select id from public.assessments where system_id = 'ASS0025');

insert into public.assessment_targets (assessment_id, school_id, level)
select
  (select id from public.assessments where system_id = 'ASS0025'),
  (select id from public.schools where name = 'Little Pine Junior School'),
  lvl
from unnest(array[5, 6, 7]) as lvl;

-- 3. Verify — should return 49.
select count(*) as eligible_count
  from public.eligible_students_for_assessment(
    (select id from public.assessments where system_id = 'ASS0025')
  );
