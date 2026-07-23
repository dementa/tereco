-- TERECO attendance. Run after 09-assessment-collaborators.sql.
--
-- Additive: everything here can be applied to a database already holding
-- lesson_reports and notifications.
--
-- Attendance used to be two typed-in numbers (lesson_reports.present/absent).
-- This adds a per-learner record instead, attached to the lesson report it was
-- taken for, plus a way for a teacher to flag a learner who is not on the
-- roster yet (a new admission, a mid-year transfer) without leaving the
-- lesson — the request sits pending until a super_admin approves it, which
-- is when it actually becomes an account via lib/entities/accounts.ts.

-- ─── Lesson attendance ──────────────────────────────────────────────────────
-- One row per learner per lesson report. present/absent on lesson_reports
-- stays as the trigger-free summary count, derived from these rows at write
-- time by the app rather than recomputed here — there is exactly one write
-- (a lesson report is never edited after filing), so a recalc trigger like
-- responses/recalc_submission_score would be solving a problem that does not
-- exist on this table.
create table public.lesson_attendance (
  id                uuid primary key default gen_random_uuid(),
  lesson_report_id  uuid not null references public.lesson_reports(id) on delete cascade,
  student_id        uuid not null references public.profiles(id) on delete cascade,
  -- The enrolment attendance was taken under, same reasoning as
  -- assessment_submissions.enrollment_id: promoting or transferring the
  -- learner later must not rewrite which class this attendance belongs to.
  enrollment_id     uuid not null references public.enrollments(id),
  is_present        boolean not null default true,
  created_at        timestamptz not null default now(),

  unique (lesson_report_id, student_id)
);
create index lesson_attendance_report_idx  on public.lesson_attendance (lesson_report_id);
create index lesson_attendance_student_idx on public.lesson_attendance (student_id);
alter table public.lesson_attendance enable row level security;

-- The enrolment must actually be the student's own — same check
-- validate_submission_enrollment already does for assessment_submissions.
create or replace function public.validate_attendance_enrollment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.enrollments
     where id = new.enrollment_id and student_id = new.student_id
  ) then
    raise exception 'enrollment % does not belong to student %',
      new.enrollment_id, new.student_id;
  end if;
  return new;
end;
$$;

create trigger trg_attendance_enrollment
  before insert or update on public.lesson_attendance
  for each row execute function public.validate_attendance_enrollment();

-- ─── Student requests ───────────────────────────────────────────────────────
-- A teacher's proposed new learner, pending super_admin approval. Kept
-- separate from profiles/enrollments — nothing here is a real account until
-- approved, so it must not be joinable into rosters, notifications-for-a-
-- student, or anything else that assumes a profile row is a real person.
create table public.student_requests (
  id                 uuid primary key default gen_random_uuid(),
  requested_by       uuid not null references public.profiles(id),
  school_id          uuid not null references public.schools(id),
  class_id           uuid not null references public.classes(id),
  stream_id          uuid references public.streams(id),

  first_name         text not null check (first_name <> ''),
  middle_name        text,
  last_name          text not null check (last_name <> ''),
  gender             text check (gender in ('male','female')),
  date_of_birth      date,
  note               text not null default '',

  status             text not null default 'pending'
                       check (status in ('pending','approved','rejected')),
  reviewed_by        uuid references public.profiles(id),
  reviewed_at        timestamptz,
  rejection_reason   text,
  -- Set once approved — the profiles row that request became.
  created_student_id uuid references public.profiles(id),

  created_at         timestamptz not null default now(),

  -- A decision needs its reviewer, and a rejection owes a reason.
  constraint student_requests_reviewed_ck check (
    status = 'pending' or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint student_requests_rejection_ck check (
    status <> 'rejected' or coalesce(rejection_reason, '') <> ''
  )
);
create index student_requests_status_idx    on public.student_requests (status);
create index student_requests_requester_idx on public.student_requests (requested_by);
alter table public.student_requests enable row level security;

-- Same school/class/stream consistency check lesson_reports and enrollments
-- already use — a class from another school, or a stream from another class,
-- is rejected here instead of silently accepted.
create trigger trg_student_requests_hierarchy
  before insert or update on public.student_requests
  for each row execute function public.validate_class_hierarchy();

-- ─── Lesson report review tracking ──────────────────────────────────────────
-- The first review state lesson_reports has ever had. Filing a report already
-- notifies admins (app/api/lesson/route.ts); this is what lets the end-of-day
-- digest ask "which of today's reports has nobody looked at yet" instead of
-- re-notifying about everything every day.
alter table public.lesson_reports
  add column reviewed_by uuid references public.profiles(id),
  add column reviewed_at timestamptz;

-- ─── New notification types ─────────────────────────────────────────────────
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'lesson_filed','assessment_submitted','results_released',
    'account_created','announcement',
    'new_student_request','lesson_digest'
  ));
