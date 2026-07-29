-- Run after 14-assessment-student-target.sql.
--
-- Sessions in the wizard/attendance forms were capped at 8 per day. Some
-- schools run more than that, so widen the range to 30. Constraint names are
-- Postgres's default for an unnamed inline check (<table>_<column>_check).

alter table public.lesson_reports
  drop constraint lesson_reports_period_check,
  add  constraint lesson_reports_period_check check (period between 1 and 30);

alter table public.attendance_sessions
  drop constraint attendance_sessions_period_check,
  add  constraint attendance_sessions_period_check check (period between 1 and 30);
