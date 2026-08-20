-- TERECO: a single, shared definition of "does this target row match this
-- enrollment", reused by assessments_for_student (one student -> their
-- assessments) and the new eligible_students_for_assessment (one assessment
-- -> its eligible students). Run after 26-e-papers.sql.
--
-- Additive and idempotent. Touches no existing constraint.
--
-- ─── Why this exists ────────────────────────────────────────────────────────
-- Before this migration, assessments_for_student was the only place that knew
-- how an assessment_targets row matches a learner. The analytics work needs
-- the same match in the other direction: given one assessment, who is
-- eligible to sit it. Writing that as a second, independent copy of the
-- predicate is exactly the kind of drift that produced a real production bug
-- (a paper meant for one school's one grade level leaking to the whole school
-- plus that grade level everywhere, because the admin UI built two separate
-- OR'd target rows instead of one combined AND'd row — fixed the same day
-- this migration was written). Factoring the predicate into its own function
-- means there is exactly one implementation to get right, not two to keep in
-- sync by hand.

create or replace function public.assessment_target_matches(
  t         public.assessment_targets,
  p_student uuid,
  p_school  uuid,
  p_level   int,
  p_class   uuid
) returns boolean
language sql
immutable
as $$
  select t.student_id = p_student
      or (
        t.student_id is null
        and (t.school_id is null or t.school_id = p_school)
        and (t.level     is null or t.level     = p_level)
        and (t.class_id  is null or t.class_id  = p_class)
      )
$$;

-- Same predicate as before, now delegated to assessment_target_matches
-- instead of inlined. Behavior is unchanged.
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
            and public.assessment_target_matches(t, p_student, e.school_id, e.level, e.class_id)
       )
     );
$$;

-- The roster for one assessment: every currently-enrolled student the
-- targeting rules make eligible, independent of publication status or the
-- open/close window — analytics needs this for closed assessments too, not
-- just ones a learner could sit right now.
create or replace function public.eligible_students_for_assessment(p_assessment uuid)
returns table(
  student_id     uuid,
  enrollment_id  uuid,
  school_id      uuid,
  class_id       uuid,
  level          int
)
language sql
stable
security definer
set search_path = public
as $$
  select e.student_id, e.id, e.school_id, e.class_id, e.level
    from public.current_enrollments e
   where not exists (select 1 from public.assessment_targets t where t.assessment_id = p_assessment)
      or exists (
        select 1
          from public.assessment_targets t
         where t.assessment_id = p_assessment
           and public.assessment_target_matches(t, e.student_id, e.school_id, e.level, e.class_id)
      )
$$;

grant execute on function public.assessment_target_matches(public.assessment_targets, uuid, uuid, int, uuid) to service_role;
grant execute on function public.assessments_for_student(uuid) to service_role;
grant execute on function public.eligible_students_for_assessment(uuid) to service_role;

notify pgrst, 'reload schema';
