-- TERECO: practical scoring applies to lab lessons only. Run after 22-practical-reminders.sql.
--
-- Additive and idempotent. Safe on a database already holding attendance
-- sessions and practical observations.
--
-- ─── The problem ────────────────────────────────────────────────────────────
-- attendance_sessions has no notion of what KIND of lesson it was: no subject,
-- no lab flag. So practical scoring was offered on every register ever taken, in
-- every subject, and the nightly reminder chased teachers about all of them.
-- Against the live database that is 33 outstanding rounds on day one, most of
-- which nobody should ever be asked to score.
--
-- A teacher marks it at register time rather than the system inferring it. The
-- alternatives are worse: lesson_reports.computer_access is filed AFTER the
-- register (and may never be filed at all), and there is no timetable to consult.
-- One tap by the person who knows, at the moment they know it.
alter table public.attendance_sessions
  add column if not exists is_practical boolean not null default false;

-- Defaults to false on purpose. Every session already in the database predates
-- the question, and marking them practical retroactively would invent an answer
-- on the teacher's behalf and immediately owe them 33 rounds of scoring.

-- ─── Index ──────────────────────────────────────────────────────────────────
-- Replaces the one added in 22-practical-reminders.sql, which was wrong twice
-- over: it led on staff_id, which the reminder query never filters or orders by
-- (grouping happens in TypeScript), so the leading column was unconstrained and
-- the scan degraded to the whole partial index. And it predates is_practical, so
-- it covered every subject.
--
-- session_date leads because that IS the filter: anything before today. The
-- partial clause now carries both conditions, so the index contains only the
-- rows the reminder actually wants.
drop index if exists public.attendance_sessions_practical_pending_idx;
create index if not exists attendance_sessions_practical_pending_idx
  on public.attendance_sessions (session_date)
  where practical_scored_at is null and is_practical;

notify pgrst, 'reload schema';
