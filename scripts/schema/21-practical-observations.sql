-- TERECO practical lab-skills observation. Run after 20-marking-reminders.sql.
--
-- Additive and idempotent: safe on a database already holding attendance
-- sessions, lesson attendance and lesson reports. Nothing existing is rewritten.
--
-- ─── What this is ───────────────────────────────────────────────────────────
-- A teacher judges every present learner on seven observable practical skills,
-- in three bands, and those judgements contribute to the learner's performance
-- alongside their written assessment average.
--
-- ─── Why there is no practical_sessions table ───────────────────────────────
-- The obvious shape is a new container per scoring round: staff, school, class,
-- stream, date, period, attachable to one lesson report. attendance_sessions
-- (12-attendance-sessions.sql) already IS that container, down to the retake
-- semantics and the at-most-one-report guarantee. A second near-copy would mean
-- maintaining the same triggers, the same partial unique indexes and the same
-- attach logic twice, and the day they drift is the day a lesson has two
-- containers disagreeing about which report they belong to.
--
-- Hanging observations off the attendance session instead buys something the
-- separate table could not: the roster to score IS the roster marked present.
-- "Can a learner who was absent be scored?" stops being a design question and
-- becomes a foreign key plus one trigger.
--
-- ─── Why observations point at lesson_attendance, not at (session, student) ──
-- The natural composite key is (attendance_session_id, student_id), and
-- lesson_attendance does have a unique index on exactly that pair. It cannot be
-- a foreign key target, because that index is PARTIAL:
--
--     create unique index lesson_attendance_session_student_key
--       on public.lesson_attendance (attendance_session_id, student_id)
--       where attendance_session_id is not null;   -- 12-attendance-sessions.sql:78
--
-- Postgres will not reference a partial unique index. Pointing at
-- lesson_attendance.id instead is one column rather than three, and it inherits
-- enrollment_id from the row that already records it — so an observation can
-- never disagree with the attendance it was taken alongside about which class
-- the learner was in. Same reasoning as the enrollment_id comments on
-- assessment_submissions and lesson_attendance, arrived at by not duplicating
-- the column at all.
--
-- ─── Why enums, when the rest of this schema uses CHECK constraints ─────────
-- Deliberate inconsistency, for one reason: lib/database.types.ts types a
-- CHECK-constrained text column as plain `string` (see lesson_reports.status,
-- .computer_access, .overall_progress). The app therefore re-declares those
-- value lists by hand with nothing verifying the two agree. There is no test
-- runner in this repo yet, so the type system is the only enforcement available,
-- and gen-types.sh emits a real TypeScript union for a real Postgres enum.
--
-- That matters more here than for `status`, because the app compares its aspect
-- list against what was written to decide whether a scoring round is complete.
-- A single mistyped code would mean rounds silently never complete and no
-- practical score ever appears. gen-types.sh:6 already names this exact failure
-- mode: "queries against columns that no longer exist typecheck clean and fail
-- only at runtime — that is exactly how the whole admin surface silently rotted".
--
-- ALTER TYPE ... ADD VALUE is append-only, which is the correct semantics here:
-- a code referenced by historical observations must never disappear.
--
-- ⚠ The enum below is APPEND-ONLY once applied: ALTER TYPE can add a value but
--   not cleanly remove or rename one. Writing this file is reversible; running
--   it is not. The aspect 4 / aspect 5 overlap that was open at review time is
--   resolved (see the note on 'tries_before_asking' below), so the seven values
--   here are the settled set.

-- ─── The rubric vocabulary ──────────────────────────────────────────────────
-- Codes, never sentences. The wording a teacher reads lives in one label map in
-- the app, so rewording an aspect (the change most likely to be asked for) costs
-- one string and touches no data, leaving every historical score valid and
-- comparable.
--
-- 'tries_before_asking' was specified as "requires support from the teacher most
-- of the time". Stored that way it would have run opposite in polarity to the
-- other six: averaged naively, a learner who needed constant help would have
-- scored HIGHER, and the number would have looked entirely normal. Worse, the
-- question was unanswerable at capture — "requires support most of the time:
-- Outstanding" is not something a teacher can press with any confidence, and two
-- teachers would have guessed in opposite directions.
--
-- Inverting it introduced a second problem, since "works independently without
-- needing teacher support" then asked almost exactly what
-- 'navigates_independently' already asked. Two of seven slots measuring one
-- thing meant independence counted double in every learner's score, invisibly.
-- Split along the line that actually separates them:
--
--   navigates_independently   SKILL  — can they operate the machine at all?
--   tries_before_asking       HABIT  — do they attempt before asking?
--
-- A learner who knows the machine but calls the teacher constantly out of low
-- confidence is high on the first and low on the second; one who barely knows
-- the menus but works it out doggedly is the reverse. Different children, needing
-- different help — which is why this is worth two of the seven slots.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'practical_aspect') then
    create type public.practical_aspect as enum (
      'uses_lab_properly',
      'types_two_hands',
      'maintains_order',
      'navigates_independently',
      'tries_before_asking',
      'helps_others',
      'finishes_on_time'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'practical_band') then
    -- Three bands, not a seven-point scale, because three is what a teacher
    -- actually perceives across forty learners: the standouts, the strugglers,
    -- and the majority who are fine. A distribution near 15/70/15 is the
    -- instrument working, not apathy.
    --
    -- 'needs_support' rather than 'challenged': this label reaches a report a
    -- parent reads, and "challenged" states a verdict about the child where
    -- "needs support" states an obligation of the school.
    create type public.practical_band as enum (
      'outstanding',
      'moderate',
      'needs_support'
    );
  end if;
end
$$;

-- ─── The scoring round lives on the attendance session ──────────────────────
alter table public.attendance_sessions
  -- Set ONLY when every present learner has every aspect of the recorded rubric
  -- version. Aggregation reads complete rounds and nothing else.
  --
  -- Entry is item-first (one aspect across the whole class, seven passes), so a
  -- teacher interrupted after pass three leaves three aspects filled for forty
  -- learners. That partial state is legitimate and must persist — but counting
  -- it would compare a class scored on three aspects against a class scored on
  -- seven, which are not the same measurement, and both produce a normal-looking
  -- number. Saved and counted are deliberately different things here.
  add column if not exists practical_scored_at timestamptz,

  -- Which rubric the round was scored against. Written when the round STARTS
  -- (first observation), not when it completes: a teacher who begins under
  -- version 1 and finishes after version 2 ships would otherwise hold seven
  -- aspects against a gate demanding eight, and their work would be permanently
  -- stuck. A count would not be enough — swapping an aspect keeps the count at
  -- seven while changing what was measured.
  add column if not exists practical_rubric_version int,

  -- Resolved from session_date + school_id at write time, exactly as
  -- lesson_reports.term_id is (03-collection.sql). Practical scores are reported
  -- per term, so without this the aggregation would have to compare dates in
  -- TypeScript — a fourth copy of logic that already exists in term_for_date(),
  -- in getStudentTermAverages and in getCurrentTermId, and the only copy of the
  -- four that nothing reconciles.
  add column if not exists term_id uuid references public.terms(id);

-- A completed round must know which rubric it was judged against. Without this
-- a round could be marked complete with no version, and there would be no way to
-- tell later what "complete" had meant for it.
alter table public.attendance_sessions
  drop constraint if exists attendance_sessions_practical_version_ck;
alter table public.attendance_sessions
  add constraint attendance_sessions_practical_version_ck check (
    practical_scored_at is null or practical_rubric_version is not null
  );

create index if not exists attendance_sessions_term_idx
  on public.attendance_sessions (term_id);

-- Aggregation only ever reads completed rounds, so the index only covers them.
create index if not exists attendance_sessions_practical_scored_idx
  on public.attendance_sessions (practical_scored_at)
  where practical_scored_at is not null;

-- ─── Term resolution, mirroring set_lesson_report_term() ────────────────────
-- attendance_sessions has no updated_at, so this needs none of the "don't make
-- a reconcile look like an edit" machinery that 19-term-reconciliation.sql had
-- to add for lesson_reports.
create or replace function public.set_attendance_session_term()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.term_id := public.term_for_date(new.school_id, new.session_date);
  return new;
end;
$$;

drop trigger if exists trg_attendance_sessions_term on public.attendance_sessions;
create trigger trg_attendance_sessions_term
  before insert or update on public.attendance_sessions
  for each row execute function public.set_attendance_session_term();

-- ─── The observations ───────────────────────────────────────────────────────
create table if not exists public.practical_observations (
  id                   uuid primary key default gen_random_uuid(),

  -- The learner-in-this-lesson. Carries student_id, enrollment_id, is_present
  -- and the session, so none of them are duplicated here and none can drift.
  -- Cascade: removing an attendance row (a retaken register) takes its
  -- observations with it rather than orphaning them against a learner who is no
  -- longer recorded as having been there.
  lesson_attendance_id uuid not null references public.lesson_attendance(id) on delete cascade,

  aspect               public.practical_aspect not null,
  band                 public.practical_band   not null,

  -- HOW this band was arrived at, and the reason this column exists at all.
  --
  -- The scoring screen offers "mark the remaining 29 as Moderate" so a teacher
  -- is not forced through 287 individual taps. That is deliberate. But it means
  -- seven presses of that button produce a round that passes every completeness
  -- check, sets practical_scored_at, and is otherwise INDISTINGUISHABLE from 287
  -- real observations. Without this column there is no query that can tell the
  -- two apart, and every other guard here protects against too LITTLE data, not
  -- against data that arrived in one press.
  --
  -- 'tap'  — the teacher chose this band for this learner specifically.
  -- 'bulk' — swept in by the remainder button, a real judgement about the group
  --          rather than the individual.
  --
  -- Defaults to 'tap' so any caller that does not set it records the stronger
  -- claim only when it is actually true... which is why the scoring path sets
  -- 'bulk' explicitly rather than relying on a default going the other way.
  --
  -- This is only addable now, before the table holds anything. Once real rounds
  -- exist there is no way to backfill which cells were swept, and the question
  -- "are teachers actually observing?" becomes permanently unanswerable.
  source               text not null default 'tap' check (source in ('tap','bulk')),

  created_at           timestamptz not null default now(),
  -- Rounds stay editable until the term closes, so a revision is an ordinary
  -- event here and worth being able to see. Staff already revise filed work:
  -- 11 of the 39 lesson reports held on 2026-08-04 were updated hours after
  -- they were created.
  updated_at           timestamptz not null default now(),

  -- One band per learner per aspect. This is also what makes a re-tap and a
  -- retry-after-network-failure the same, safe operation: the client upserts on
  -- this key, so two tabs or a resent request converge instead of colliding.
  unique (lesson_attendance_id, aspect)
);

-- No index on (aspect) alone. It has seven distinct values across what will be
-- the largest table here (~116k rows per term), so it would never be selective
-- enough to use, and aggregation reaches this table by joining down from
-- attendance_sessions rather than by filtering on aspect. Lookups by
-- lesson_attendance_id ride the unique index's leading column, so the unique
-- constraint above is the only index this table needs today.

alter table public.practical_observations enable row level security;

-- ─── You cannot score a learner who was not there ───────────────────────────
-- lesson_attendance.is_present is the source of truth about who was in the room.
-- Enforced here rather than trusted to the scoring screen, for the same reason
-- lesson_reports_missed_ck is enforced in the database: client-side validation
-- is one curl away from bypass, and a fabricated observation is indistinguishable
-- from a real one once it is stored.
create or replace function public.validate_practical_present()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.lesson_attendance la
     where la.id = new.lesson_attendance_id
       and la.is_present
  ) then
    raise exception 'lesson_attendance % is not a present learner', new.lesson_attendance_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_practical_present on public.practical_observations;
create trigger trg_validate_practical_present
  before insert or update on public.practical_observations
  for each row execute function public.validate_practical_present();

-- ─── Editable while the term is open, frozen after it closes ────────────────
-- Teachers revise their work here, so a misclick on learner 30 of 41 must not be
-- permanent. But a practical score that keeps moving after the term has ended is
-- a score a parent already read changing underneath them. Term close is the
-- freeze point because it is a date that can be explained to a parent, unlike an
-- arbitrary system rule.
--
-- A session whose school has not defined its terms has no end date to be past,
-- so it stays editable — better than freezing work over calendar admin, the same
-- call 03-collection.sql made in leaving lesson_reports.term_id nullable.
create or replace function public.validate_practical_term_open()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_ends_on date;
begin
  select t.ends_on into v_ends_on
    from public.lesson_attendance la
    join public.attendance_sessions s on s.id = la.attendance_session_id
    join public.terms t              on t.id = s.term_id
   where la.id = new.lesson_attendance_id;

  if v_ends_on is not null and v_ends_on < current_date then
    raise exception 'term ended % — practical observations are read-only', v_ends_on;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- INSERT as well as UPDATE. Covering only updates would leave the rule half
-- enforced: a round nobody had started could still be scored from scratch weeks
-- after the term closed and its reports went home, which is the thing the freeze
-- exists to stop. It also means an unscoreable round stops generating reminders
-- once its term ends, instead of nagging its teacher forever.
drop trigger if exists trg_validate_practical_term_open on public.practical_observations;
create trigger trg_validate_practical_term_open
  before insert or update on public.practical_observations
  for each row execute function public.validate_practical_term_open();

-- ─── Reconcile now covers attendance sessions too ───────────────────────────
-- Same failure this function was written for, on a second table: a session filed
-- before its term row existed is permanently detached from that term, and
-- nothing ever revisits it. That is not hypothetical — it was true of 31 of 35
-- lesson reports as of 2026-08-03.
--
-- Returns the total number of rows whose term actually changed, across both
-- tables, keeping the contract the original comment described.
create or replace function public.reconcile_terms(p_school_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reports  integer;
  v_sessions integer;
begin
  with resolved as (
    select lr.id,
           lr.term_id                                            as old_term,
           public.term_for_date(lr.school_id, lr.lesson_date)     as new_term
      from public.lesson_reports lr
     where p_school_id is null or lr.school_id = p_school_id
  )
  update public.lesson_reports lr
     set term_id = r.new_term
    from resolved r
   where lr.id = r.id
     and r.old_term is distinct from r.new_term;

  get diagnostics v_reports = row_count;

  with resolved as (
    select s.id,
           s.term_id                                             as old_term,
           public.term_for_date(s.school_id, s.session_date)      as new_term
      from public.attendance_sessions s
     where p_school_id is null or s.school_id = p_school_id
  )
  update public.attendance_sessions s
     set term_id = r.new_term
    from resolved r
   where s.id = r.id
     and r.old_term is distinct from r.new_term;

  get diagnostics v_sessions = row_count;

  return v_reports + v_sessions;
end;
$$;

grant execute on function public.reconcile_terms(uuid) to service_role;
grant execute on function public.set_attendance_session_term() to service_role;
grant execute on function public.validate_practical_present() to service_role;
grant execute on function public.validate_practical_term_open() to service_role;
grant all privileges on all tables in schema public to service_role;

-- ─── Backfill ───────────────────────────────────────────────────────────────
-- Resolves term_id for every attendance session already filed, and re-checks
-- lesson reports at the same time. Idempotent: on a healthy database this
-- changes nothing and returns 0.
select public.reconcile_terms() as rows_reattached_to_their_term;

notify pgrst, 'reload schema';
