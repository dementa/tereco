-- Run after 11-multi-super-admin.sql.
--
-- Attendance used to be born already attached to the lesson report being
-- filed in the same request. Splitting the two forms — attendance taken at
-- the start of a lesson, the report filed after — means a roster mark can no
-- longer assume a report exists yet: there may not be one yet, there may
-- never be one (attendance taken, report never filed), or several unattached
-- sessions may exist for the same slot (a retake after a mistake). This table
-- is that: addressable, listable, optionally consumed later by exactly one
-- lesson report.

create table public.attendance_sessions (
  id                uuid primary key default gen_random_uuid(),

  -- Same identity a lesson report is filed against — matching these exactly
  -- is what "the attendance for this slot" means, and it must be this
  -- teacher's own session, never another teacher's.
  staff_id          uuid not null references public.profiles(id),
  school_id         uuid not null references public.schools(id),
  class_id          uuid not null references public.classes(id),
  stream_id         uuid references public.streams(id),

  session_date      date not null,
  period            int  not null check (period between 1 and 8),
  taken_at          timestamptz not null default now(),

  -- Null = still available to attach, or taken and never followed up with a
  -- report — both are ordinary long-term states, not "pending" anything.
  -- on delete set null: deleting a lesson report must free its session back
  -- up rather than take it down too.
  lesson_report_id  uuid references public.lesson_reports(id) on delete set null,

  created_at        timestamptz not null default now()
);

create index attendance_sessions_staff_idx on public.attendance_sessions (staff_id, session_date desc);
-- The auto-match lookup, sized to exactly that query: this teacher's own
-- unattached sessions for one slot.
create index attendance_sessions_match_idx
  on public.attendance_sessions (staff_id, class_id, stream_id, session_date, period)
  where lesson_report_id is null;
-- A session may be claimed by at most one report, ever — the DB-level half
-- of the race guard (app-level half is the conditional UPDATE in
-- lib/attendance.ts's claimAttendanceSession()).
create unique index attendance_sessions_report_key
  on public.attendance_sessions (lesson_report_id)
  where lesson_report_id is not null;

alter table public.attendance_sessions enable row level security;

create trigger trg_attendance_sessions_hierarchy
  before insert or update on public.attendance_sessions
  for each row execute function public.validate_class_hierarchy();

-- Deliberately NO uniqueness on (staff/class/stream/date/period): a retake
-- after a mistake must be able to create another session for the same slot.
-- lesson_reports already stops the SLOT from being double-filed; multiple
-- unattached sessions for one slot is exactly the "more than one match" case
-- the attach step shows a picker for, not something to prevent here.

-- ─── Re-point lesson_attendance at the session ──────────────────────────────
-- Nullable, not backfilled: existing rows (if any) keep working exactly as
-- today, keyed by lesson_report_id, which is untouched. Only new rows (taken
-- through the new Attendance form) carry attendance_session_id, set at
-- insert time and never null for them in practice — enforced by application
-- code, not a NOT NULL column constraint, so this migration never has to
-- reason about whether production already has orphaned historical rows.
alter table public.lesson_attendance
  add column attendance_session_id uuid references public.attendance_sessions(id) on delete cascade,
  alter column lesson_report_id drop not null;

-- Prevents double-inserting the same learner within one attendance session.
-- (The existing unique(lesson_report_id, student_id) constraint is untouched
-- and keeps doing its job for report-time inserts; it does NOT protect
-- session-time inserts because lesson_report_id is null for all of them
-- until attach, and NULL <> NULL means that constraint is silently
-- ineffective at this stage.)
create unique index lesson_attendance_session_student_key
  on public.lesson_attendance (attendance_session_id, student_id)
  where attendance_session_id is not null;
create index lesson_attendance_session_idx on public.lesson_attendance (attendance_session_id);
