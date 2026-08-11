-- TERECO practical scoring reminders. Run after 21-practical-observations.sql.
--
-- Additive and idempotent-ish: it widens a check constraint and adds one index.
-- No new tables — "which rounds are still waiting to be scored" is already
-- answered by attendance_sessions.practical_scored_at, which the completeness
-- gate in lib/entities/practical-observations.ts is the only thing that sets. A
-- reminder built on it therefore cannot disagree with the scoring screen.

-- ─── Notification types ─────────────────────────────────────────────────
-- Widens the existing notifications.type check (04-notifications.sql, last
-- widened in 20-marking-reminders.sql), following the house convention: a new
-- sequentially numbered file ALTERs the constraint rather than editing the
-- original file in place.
--
-- practical_reminder is its own type rather than reusing 'marking_reminder' so
-- the bell can style it separately, and so a teacher drowning in one kind of
-- nudge can have it suppressed without losing the other. They are also aimed at
-- different work: marking is a queue of other people's scripts, practical
-- scoring is the teacher's own observation of a lesson they taught.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'lesson_filed','assessment_submitted','results_released',
    'account_created','announcement','new_student_request','lesson_digest',
    'library_content_approved','library_content_rejected','marking_reminder',
    'practical_reminder'
  ));

-- ─── Index ──────────────────────────────────────────────────────────────
-- 21-practical-observations.sql indexed the COMPLETE rounds, because that is
-- what aggregation reads. The reminder wants the exact opposite set, and it runs
-- nightly across every school: without this it is a sequential scan of every
-- attendance session ever taken, every night, forever.
--
-- Ordered (staff_id, session_date) because the reminder groups by teacher and
-- excludes anything from today — a round is not overdue an hour after the
-- lesson, and nagging a teacher before they have had a chance is how a reminder
-- gets ignored permanently.
create index if not exists attendance_sessions_practical_pending_idx
  on public.attendance_sessions (staff_id, session_date)
  where practical_scored_at is null;

notify pgrst, 'reload schema';
