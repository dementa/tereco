-- TERECO: a learner should not be offered a paper they have already sat.
-- Run after 06-offline-submissions.sql. Replaces one function; no data changes.
--
-- unique (assessment_id, student_id) on assessment_submissions already made a
-- second submission impossible, but the paper stayed in the learner's list, so
-- they could open it, answer every question, and only find out at the very end
-- that none of it counted. Refusing the work after it is done is not the same
-- as not offering it.

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
     -- Already sat, in either mode: an online submission and an uploaded paper
     -- are both sittings, and both consume the single attempt.
     --
     -- Deliberately ANY submission row, not just status = 'submitted'/'marked'.
     -- Nothing writes 'in_progress' today — a paper is saved in one shot — so
     -- every row here is a completed sitting. If resumable sittings are ever
     -- added, this must exempt 'in_progress', or a learner who is halfway
     -- through will find the paper has vanished from their list.
     and not exists (
       select 1
         from public.assessment_submissions s
        where s.assessment_id = a.id
          and s.student_id = p_student
     )
     and (
       -- untargeted: everyone
       not exists (select 1 from public.assessment_targets t where t.assessment_id = a.id)
       or exists (
         select 1
           from public.assessment_targets t
          where t.assessment_id = a.id
            and (t.school_id is null or t.school_id = e.school_id)
            and (t.level     is null or t.level     = e.level)
            and (t.class_id  is null or t.class_id  = e.class_id)
       )
     );
$$;

grant execute on function public.assessments_for_student(uuid) to service_role;
