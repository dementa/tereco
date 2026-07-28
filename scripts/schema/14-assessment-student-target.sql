-- TERECO: target an assessment at one specific student, not just a school,
-- grade level, or class. Run after 13-stem-parent-questions.sql.
--
-- Additive: everything here can be applied to a database already holding
-- assessment_targets rows.

alter table public.assessment_targets
  add column if not exists student_id uuid references public.profiles(id) on delete cascade;

alter table public.assessment_targets drop constraint if exists assessment_targets_not_empty_ck;
alter table public.assessment_targets
  add constraint assessment_targets_not_empty_ck
  check (school_id is not null or level is not null or class_id is not null or student_id is not null);

drop index if exists public.assessment_targets_unique;
create unique index assessment_targets_unique
  on public.assessment_targets (
    assessment_id,
    coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(level, -1),
    coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(student_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- A student target matches by id alone, independent of the school/level/class
-- columns (which the app leaves null on that row). It still requires the
-- learner to have a current enrollment at all, same as every other target
-- type here — assessments_for_student joins current_enrollments before this
-- function ever runs, so a student target for a learner with no active
-- enrollment matches nothing, same as an untargeted assessment already would
-- for that learner today.
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
            and (
              t.student_id = p_student
              or (
                t.student_id is null
                and (t.school_id is null or t.school_id = e.school_id)
                and (t.level     is null or t.level     = e.level)
                and (t.class_id  is null or t.class_id  = e.class_id)
              )
            )
       )
     );
$$;

grant execute on function public.assessments_for_student(uuid) to service_role;

notify pgrst, 'reload schema';
