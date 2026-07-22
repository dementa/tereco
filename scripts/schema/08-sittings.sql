-- TERECO: a sitting is not a submission.
-- Run after 07-sitting-once.sql. Additive; no existing data is touched.
--
-- A power cut during a paper wiped every learner's work, because progress
-- lived only in the browser's sessionStorage — which is erased when the
-- browser session ends — and nothing reached the server until the final
-- submit. The clock lived there too, so a reboot also handed out a fresh
-- countdown: the same fault destroyed the work AND reset the timer.
--
-- The obvious fix is to open the assessment_submissions row early with
-- status = 'in_progress'. That is a trap:
--   * unique (assessment_id, student_id) would then make the FINAL submit
--     collide with the learner's own in-progress row, and saveSubmission
--     reports that collision as ALREADY_SUBMITTED;
--   * assessments_for_student (07) excludes any assessment the learner has a
--     submission row for, so starting a paper would remove it from their own
--     list and they could never resume it.
--
-- So a sitting gets its own table. assessment_submissions keeps its single
-- meaning — a completed sitting — which is what makes the unique constraint a
-- real one-attempt guarantee and lets 07 stay exactly as written.

create table public.assessment_sittings (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references public.assessments(id) on delete cascade,
  student_id     uuid not null references public.profiles(id)    on delete cascade,

  -- The enrolment sat under, same reasoning as assessment_submissions: the
  -- sitting belongs to the class they were in on the day.
  enrollment_id  uuid not null references public.enrollments(id),

  -- THE point of this table. The countdown is computed from this server
  -- timestamp, so clearing browser storage, rebooting, or moving to another
  -- machine all resume the same clock instead of granting a fresh one.
  started_at     timestamptz not null default now(),

  -- Touched whenever the learner's client checks in. Lets an invigilator see
  -- who is mid-paper, and who went quiet ten minutes ago.
  last_seen_at   timestamptz not null default now(),

  -- One sitting per learner per paper, which makes "start" idempotent: a
  -- reload resumes rather than restarting.
  unique (assessment_id, student_id)
);

create index assessment_sittings_assessment_idx on public.assessment_sittings (assessment_id);
create index assessment_sittings_student_idx    on public.assessment_sittings (student_id);
alter table public.assessment_sittings enable row level security;

-- The sitting's enrolment must actually be that student's — same guard the
-- submissions table already carries.
create or replace function public.validate_sitting_enrollment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.enrollments e
     where e.id = new.enrollment_id and e.student_id = new.student_id
  ) then
    raise exception 'enrollment % does not belong to student %', new.enrollment_id, new.student_id;
  end if;
  return new;
end;
$$;

create trigger trg_validate_sitting_enrollment
  before insert or update on public.assessment_sittings
  for each row execute function public.validate_sitting_enrollment();

grant all privileges on all tables in schema public to service_role;
grant execute on function public.validate_sitting_enrollment() to service_role;
