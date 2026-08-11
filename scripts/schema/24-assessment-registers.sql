-- TERECO: a register for an assessment sitting. Run after 23-practical-lessons-only.sql.
--
-- Additive and idempotent. Safe on a database already holding attendance
-- sessions, lesson attendance and practical observations.
--
-- ─── Why this is not a new table ────────────────────────────────────────────
-- The ask is: when learners sit an assessment under a teacher's supervision, the
-- teacher takes a register of who turned up, then scores practical bands during
-- it, and that feeds performance the same way a lesson does.
--
-- attendance_sessions ALREADY means "a teacher took a register for a group at a
-- point in time". Everything downstream — lesson_attendance, the bands in
-- practical_observations, the scoring grid, the aggregation, the report card —
-- is keyed off that and needs no change whatsoever. A parallel
-- assessment_attendance_sessions table would duplicate the triggers, the partial
-- unique indexes, the retake semantics and the attach flow, and the day the two
-- drift is the day a learner has two registers that disagree.
--
-- This is the same call that deleted a proposed practical_sessions table at
-- review: a second near-identical container is the thing to avoid.
--
-- ─── What assessment_sittings is, and why it is not this ────────────────────
-- 08-sittings.sql already records that a learner OPENED a paper — created by the
-- learner, when they start, to anchor the countdown to a server clock. It is not
-- a teacher's observation that a child was in the room. A learner can have a
-- sitting without an invigilator ever seeing them, and an invigilator can mark a
-- child present who then never opens the paper. Both facts are real and neither
-- substitutes for the other.

alter table public.attendance_sessions
  add column if not exists kind text not null default 'lesson'
    check (kind in ('lesson', 'assessment')),
  add column if not exists assessment_id uuid references public.assessments(id) on delete cascade;

-- A register is for a lesson or for one assessment, never both and never
-- neither. Enforced rather than trusted to the form: an assessment register with
-- no assessment is a row nothing downstream can interpret.
alter table public.attendance_sessions
  drop constraint if exists attendance_sessions_kind_ck;
alter table public.attendance_sessions
  add constraint attendance_sessions_kind_ck check (
    (kind = 'lesson'     and assessment_id is null) or
    (kind = 'assessment' and assessment_id is not null)
  );

-- An assessment register exists in order to be scored — that is the whole point
-- of taking it. Forcing is_practical true keeps every existing filter (the
-- teacher's queue, the reminder, the scoring guard) working unchanged rather
-- than each having to learn about `kind`.
alter table public.attendance_sessions
  drop constraint if exists attendance_sessions_assessment_practical_ck;
alter table public.attendance_sessions
  add constraint attendance_sessions_assessment_practical_ck check (
    kind <> 'assessment' or is_practical
  );

-- ─── Keep assessment registers out of the lesson-report attach flow ─────────
-- claimAttendanceSession() in lib/attendance.ts finds an unattached session by
-- (staff, class, stream, date, period) with lesson_report_id null. An assessment
-- register matches that shape exactly, so without this a teacher filing an
-- ordinary lesson report would silently swallow the register they took for a
-- test — taking its learners with it, and leaving the assessment unscoreable.
--
-- Narrowing the index is half the fix; the query is filtered on kind too. Both,
-- because an index is an optimisation and a filter is a guarantee.
drop index if exists public.attendance_sessions_match_idx;
create index if not exists attendance_sessions_match_idx
  on public.attendance_sessions (staff_id, class_id, stream_id, session_date, period)
  where lesson_report_id is null and kind = 'lesson';

create index if not exists attendance_sessions_assessment_idx
  on public.attendance_sessions (assessment_id)
  where assessment_id is not null;

notify pgrst, 'reload schema';
