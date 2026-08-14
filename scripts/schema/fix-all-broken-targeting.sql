-- One-off data fix, not a schema migration. Same root cause as ASS0025
-- (see fix-ass0025-targeting.sql): a school-scoped row coexisting with one
-- or more bare level-only rows (no school_id) — each bare row leaks that
-- grade level to every school in the system, not just the intended one.
-- A system-wide audit found 6 more assessments with this exact shape.
-- Confirmed scope for each with the user before writing this:
--
--   ASS0010  Computer keyboard 101        -> Ebenezer: J1, J2
--   ASS0017  P.7 Integrated Science       -> Ebenezer + Little Pine: J7
--   ASS0015  Mid-Term - Computer Studies  -> Ebenezer + Little Pine: J5, J6, J7
--   ASS0024  Sample Test                  -> Ebenezer: J4, J5, J6
--   ASS0004  Computer Programing 101      -> Ebenezer: J1, J6, J7
--   ASS0021  PRIMARY SEVEN MOCK EXAM 2026 -> Ebenezer + Little Pine: J7 only
--            (Level 6 and Level 2 on this one were confirmed stray, not
--            real scope, and dropped)
--
-- Root cause already fixed in
-- components/assessment/AssessmentSetupPanel.tsx (addSchoolLevelTarget no
-- longer clears the school field after each add), so this shouldn't recur.

-- 1. Backup every row this touches, across all 6 assessments, before
--    anything changes. Reuses the same backup table ASS0025's fix created.
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
 where assessment_id in (
   select id from public.assessments
    where system_id in ('ASS0010', 'ASS0017', 'ASS0015', 'ASS0024', 'ASS0004', 'ASS0021')
 );

-- 2. Replace the broken rows, one assessment at a time.

delete from public.assessment_targets
 where assessment_id = (select id from public.assessments where system_id = 'ASS0010');
insert into public.assessment_targets (assessment_id, school_id, level)
select (select id from public.assessments where system_id = 'ASS0010'),
       (select id from public.schools where name = 'Ebenezer Standard Junior Schools'),
       lvl
  from unnest(array[1, 2]) as lvl;

delete from public.assessment_targets
 where assessment_id = (select id from public.assessments where system_id = 'ASS0017');
insert into public.assessment_targets (assessment_id, school_id, level)
select (select id from public.assessments where system_id = 'ASS0017'), sch.id, 7
  from public.schools sch
 where sch.name in ('Ebenezer Standard Junior Schools', 'Little Pine Junior School');

delete from public.assessment_targets
 where assessment_id = (select id from public.assessments where system_id = 'ASS0015');
insert into public.assessment_targets (assessment_id, school_id, level)
select (select id from public.assessments where system_id = 'ASS0015'), sch.id, lvl
  from public.schools sch
 cross join unnest(array[5, 6, 7]) as lvl
 where sch.name in ('Ebenezer Standard Junior Schools', 'Little Pine Junior School');

delete from public.assessment_targets
 where assessment_id = (select id from public.assessments where system_id = 'ASS0024');
insert into public.assessment_targets (assessment_id, school_id, level)
select (select id from public.assessments where system_id = 'ASS0024'),
       (select id from public.schools where name = 'Ebenezer Standard Junior Schools'),
       lvl
  from unnest(array[4, 5, 6]) as lvl;

delete from public.assessment_targets
 where assessment_id = (select id from public.assessments where system_id = 'ASS0004');
insert into public.assessment_targets (assessment_id, school_id, level)
select (select id from public.assessments where system_id = 'ASS0004'),
       (select id from public.schools where name = 'Ebenezer Standard Junior Schools'),
       lvl
  from unnest(array[1, 6, 7]) as lvl;

delete from public.assessment_targets
 where assessment_id = (select id from public.assessments where system_id = 'ASS0021');
insert into public.assessment_targets (assessment_id, school_id, level)
select (select id from public.assessments where system_id = 'ASS0021'), sch.id, 7
  from public.schools sch
 where sch.name in ('Ebenezer Standard Junior Schools', 'Little Pine Junior School');

-- 3. Verify — eligible count per assessment after the fix.
select
  a.system_id,
  a.title,
  (select count(*) from public.eligible_students_for_assessment(a.id)) as eligible_count
from public.assessments a
where a.system_id in ('ASS0010', 'ASS0017', 'ASS0015', 'ASS0024', 'ASS0004', 'ASS0021')
order by a.system_id;
