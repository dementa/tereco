-- TERECO Collect — local database for offline assessment (issue #33, Phase 1).
--
-- This is NOT a mirror of Supabase. It holds exactly what one lab machine needs
-- to run the papers prepared on it, plus the work produced there that has not
-- reached the server yet. Nothing else is copied down: a lab machine has no
-- business holding another school's data, and a mirror would mean keeping a
-- second schema in step with 20+ server migrations by hand.
--
-- Applied by desktop/db/index.js, which tracks the version in `user_version`.

-- ─── Version 1 ──────────────────────────────────────────────────────────────

create table if not exists app_metadata (
  key   text primary key,
  value text not null
);

-- The learners who have prepared on THIS machine. A shared lab computer
-- accumulates several across a day.
create table if not exists students (
  id          text primary key,   -- Supabase profile uuid
  system_id   text,               -- the human-facing TST… id
  name        text not null,
  class_label text
);

-- The paper itself. Shared: two students sitting the same assessment on one
-- machine reference one row rather than storing the questions twice.
create table if not exists assessments (
  id               text primary key,
  title            text not null,
  instructions     text,
  duration_seconds integer not null,
  config_json      text,
  question_count   integer not null,
  -- Checksum over the downloaded payload, recomputed on load. A truncated
  -- download must never be sittable.
  checksum         text not null,
  downloaded_at    integer not null
);

create table if not exists questions (
  id            text primary key,
  assessment_id text not null references assessments(id) on delete cascade,
  position      integer not null,
  code          text not null,
  question_text text not null,
  question_type text not null,
  options_json  text,
  image_url     text,
  max_score     real,
  config_json   text
);

create index if not exists questions_assessment_idx
  on questions (assessment_id, position);

-- Authorisation: this student may sit this assessment on this device.
--
-- `token` is the server-signed grant covering student, assessment, sitting
-- start and validity. It is the only thing that makes the rows above
-- trustworthy — every other column here is editable by anyone who can open the
-- file, so authorisation is decided by verifying the signature, never by
-- reading student_id.
create table if not exists packages (
  assessment_id text not null references assessments(id) on delete cascade,
  student_id    text not null references students(id) on delete cascade,
  token         text not null,
  -- 'preparing' until the payload is written AND verified. The renderer only
  -- ever lists 'ready', so an interrupted download cannot be sat.
  status        text not null check (status in ('preparing', 'ready')),
  prepared_at   integer not null,
  expires_at    integer,
  primary key (assessment_id, student_id)
);

-- One sitting.
--
-- `unique (assessment_id, student_id)` deliberately mirrors the constraint on
-- the server's assessment_submissions. Keeping the same rule locally means the
-- device cannot manufacture a second attempt that the server would then reject
-- at sync time, when the student is no longer at the desk to be told.
create table if not exists attempts (
  id            text primary key,   -- uuid generated on the device; the idempotency key at sync
  assessment_id text not null references assessments(id) on delete cascade,
  student_id    text not null references students(id) on delete cascade,
  device_id     text not null,
  started_at    integer not null,   -- epoch ms, from the signed token, never from the renderer
  -- Highest wall-clock value ever observed while this attempt was open.
  -- Winding the system clock back does not give the student more time because
  -- elapsed time is measured against this floor, not against a clock they can
  -- change.
  clock_floor   integer not null,
  current_index integer not null default 0,
  submitted_at  integer,
  status        text not null check (status in ('in_progress', 'submitted')),
  unique (assessment_id, student_id)
);

-- One row per answered question. Rewritten in place as the student changes
-- their mind, so the table is the current state and not a history.
create table if not exists answers (
  attempt_id  text not null references attempts(id) on delete cascade,
  question_id text not null references questions(id) on delete cascade,
  value       text not null,
  updated_at  integer not null,
  primary key (attempt_id, question_id)
);

-- Work that has not reached Supabase.
--
-- This is the single source of truth for sync state. `attempts` deliberately
-- carries no sync_status column: two places recording the same fact drift, and
-- the one that drifts here would either hide a student's unsent paper or claim
-- an unsent paper was safe.
create table if not exists sync_queue (
  id              integer primary key autoincrement,
  attempt_id      text not null references attempts(id) on delete cascade,
  operation       text not null,
  status          text not null check (status in ('pending', 'syncing', 'synced', 'failed')),
  retry_count     integer not null default 0,
  created_at      integer not null,
  last_attempt_at integer,
  synced_at       integer,
  error_message   text,
  -- An attempt is queued for a given operation once. Retries update the row
  -- rather than appending, so a machine that reconnects repeatedly does not
  -- build a queue of duplicates pointing at the same work.
  unique (attempt_id, operation)
);

create index if not exists sync_queue_pending_idx
  on sync_queue (status, created_at)
  where status in ('pending', 'failed');
