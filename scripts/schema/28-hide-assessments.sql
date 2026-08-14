-- TERECO: lets a super_admin hide an assessment (e.g. one created during
-- testing) from every other role's lists without deleting it. Run after
-- 27-assessment-eligibility.sql.
--
-- Additive and idempotent. Mirrors the existing deleted_at soft-delete
-- column as a second, independent timestamp — hiding and deleting are
-- different operations. A hidden assessment is fully intact and reversible
-- by any super_admin; a deleted one is gone from every view, including a
-- super_admin's.

alter table public.assessments
  add column if not exists hidden_at timestamptz;

-- assessments_for_student must also exclude hidden papers — same predicate
-- deleted_at already gets, added the same way. Definition otherwise
-- unchanged from 27-assessment-eligibility.sql.
create or replace function public.assessments_for_student(p_student uuid)
returns setof public.assessments
language sql
stable
security definer
set search_path = public
as $$
  select a.*
    from public.assessments a
    join public.current_enrollments e on e.student_id = p_student
   where a.deleted_at is null
     and a.hidden_at is null
     and a.status = 'published'
     and (a.opens_at  is null or a.opens_at  <= now())
     and (a.closes_at is null or a.closes_at >  now())
     and not exists (
       select 1
         from public.assessment_submissions s
        where s.assessment_id = a.id
          and s.student_id = p_student
     )
     and (
       not exists (select 1 from public.assessment_targets t where t.assessment_id = a.id)
       or exists (
         select 1
           from public.assessment_targets t
          where t.assessment_id = a.id
            and public.assessment_target_matches(t, p_student, e.school_id, e.level, e.class_id)
       )
     );
$$;
