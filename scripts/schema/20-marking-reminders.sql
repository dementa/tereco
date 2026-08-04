-- TERECO marking reminders. Run after 19-term-reconciliation.sql.
--
-- Additive and idempotent-ish: it only widens a check constraint. No new
-- tables — "which scripts are still waiting to be marked" is already answered
-- by assessment_submissions.status, which recalc_submission_score()
-- (03-collection.sql) maintains: a submission drops back out of 'marked' the
-- moment a new unscored response appears, so a reminder built on it can never
-- disagree with the marking screen.

-- ─── Notification types ─────────────────────────────────────────────────
-- Widens the existing notifications.type check (04-notifications.sql, last
-- widened in 17-library.sql), following the house convention: a new
-- sequentially numbered file ALTERs the constraint rather than editing the
-- original file in place.
--
-- marking_reminder is its own type rather than reusing 'announcement' so the
-- bell can style it, and so these can be counted or suppressed later without
-- having to parse titles.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'lesson_filed','assessment_submitted','results_released',
    'account_created','announcement','new_student_request','lesson_digest',
    'library_content_approved','library_content_rejected','marking_reminder'
  ));

-- ─── Index ──────────────────────────────────────────────────────────────
-- The reminder counts pending scripts one assessment at a time. Without this
-- that is a sequential scan of every submission ever made, once per open
-- assessment, every night.
create index if not exists assessment_submissions_pending_idx
  on public.assessment_submissions (assessment_id)
  where status = 'submitted';
