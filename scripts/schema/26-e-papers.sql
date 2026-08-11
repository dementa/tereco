-- TERECO: closed assessments become untimed practice papers — E-Papers.
-- Run after 25-practical-weight.sql.
--
-- Additive and idempotent. Touches no existing constraint.
--
-- ─── What this is for ───────────────────────────────────────────────────────
-- When an assessment is officially closed today, everything in it dies: the
-- questions, and the model answers a teacher already wrote. assessments_for_student
-- filters on status = 'published', so a closed paper is not reachable by a
-- learner in any form. There is no revision surface in TERECO at all.
--
-- An E-Paper is that same paper, reopened for practice: no timer, unlimited
-- retakes, and the expected answer shown afterwards.
--
-- ─── Why practice does not live in assessment_submissions ───────────────────
-- unique (assessment_id, student_id) on assessment_submissions means one row is
-- one real sitting, and three separate things depend on that meaning:
--   * the "already sat" filter in assessments_for_student
--   * assessment_submissions_pending_idx where status = 'submitted' (the
--     marking-reminder digest)
--   * results and league tables
-- A practice attempt is none of those things and must not be counted as one.
-- Same call already made for practical observations in 21-practical-observations.sql.
--
-- ─── Why "E-Paper" and not "past paper" ─────────────────────────────────────
-- 'past_paper' is already a library_content.content_type, `downloadable` is a
-- generated column keyed on it (17-library.sql:31), and the Library already has
-- a Past Papers tab backed by uploaded PDFs. Both surfaces coexist; the names
-- must not collide.

-- ─── Opt-in ─────────────────────────────────────────────────────────────────
-- Deliberately a nullable timestamp rather than a boolean default true.
-- Closing a paper offers "also publish as an E-Paper"; null means closed but
-- not published for practice. An opt-out default would dump every historical
-- closed paper into the Library the moment this migration runs, which is not a
-- decision a migration gets to make on a school's behalf.
alter table public.assessments
  add column if not exists e_paper_at timestamptz;

comment on column public.assessments.e_paper_at is
  'When this closed paper was published for untimed practice in the Library. '
  'Null = closed but not offered as an E-Paper. Set by a teacher at close time.';

create index if not exists assessments_e_paper_idx
  on public.assessments (e_paper_at)
  where e_paper_at is not null and deleted_at is null;

-- ─── Attempts ───────────────────────────────────────────────────────────────
-- One row per practice sitting. Deliberately NO unique (assessment_id, student_id):
-- practising the same paper repeatedly is what revision IS, including a paper
-- the learner already sat for real. This is a conscious divergence from the
-- sitting-once rule, not an oversight.
create table if not exists public.practice_attempts (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references public.assessments(id) on delete cascade,
  student_id     uuid not null references public.profiles(id) on delete cascade,

  -- Nullable, unlike assessment_submissions.enrollment_id. A practice attempt
  -- is not a graded record attached to a class on a day, and a learner between
  -- enrolments — mid-transfer, or over a holiday — should still be able to
  -- revise. Recorded when known, purely so "who was practising" can be
  -- answered later without re-deriving it from dates.
  enrollment_id  uuid references public.enrollments(id),

  started_at     timestamptz not null default now(),
  -- Null = in flight. An abandoned attempt stays null forever and that is fine;
  -- nothing downstream reads it.
  finished_at    timestamptz,

  -- The auto-marked portion ONLY (mcq/checkbox/true_false/fill). Short and long
  -- answers are not counted in either figure, so auto_score/auto_max is an
  -- honest fraction of what a machine can judge rather than a fake total that
  -- silently treats every essay as a zero.
  auto_score     numeric(6,2) check (auto_score >= 0),
  auto_max       numeric(6,2) check (auto_max >= 0),

  created_at     timestamptz not null default now(),

  check (finished_at is null or finished_at >= started_at),
  -- Both or neither. A score with no maximum is unreadable.
  check ((auto_score is null) = (auto_max is null)),
  check (auto_score is null or auto_score <= auto_max)
);

comment on table public.practice_attempts is
  'One untimed practice sitting of a closed assessment (an E-Paper). Repeatable '
  'by design — no unique constraint on (assessment_id, student_id).';

-- "This learner's attempts at this paper, most recent first" is the only access
-- pattern the results screen has.
create index if not exists practice_attempts_student_idx
  on public.practice_attempts (student_id, assessment_id, started_at desc);

-- Attempts per paper, for the sponsor-facing count of whether the mandate landed.
create index if not exists practice_attempts_assessment_idx
  on public.practice_attempts (assessment_id, started_at desc);

alter table public.practice_attempts enable row level security;

-- ─── Responses ──────────────────────────────────────────────────────────────
create table if not exists public.practice_responses (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid not null references public.practice_attempts(id) on delete cascade,
  question_id  uuid not null references public.questions(id) on delete cascade,
  answer       text not null default '',

  -- THREE-VALUED ON PURPOSE, and the results screen must respect it:
  --   true  = auto-marked correct
  --   false = auto-marked wrong
  --   null  = NOT AUTO-MARKABLE (short/long), NOT wrong
  -- Rendering null as wrong makes every essay question read as a failure and
  -- turns a good practice run into a bad one.
  is_correct   boolean,

  created_at   timestamptz not null default now(),

  unique (attempt_id, question_id)
);

comment on column public.practice_responses.is_correct is
  'true = correct, false = wrong, NULL = not auto-markable (short/long). '
  'Null is not wrong — render it distinctly.';

create index if not exists practice_responses_attempt_idx
  on public.practice_responses (attempt_id);

alter table public.practice_responses enable row level security;

-- A practice response may only answer a question belonging to the paper being
-- practised. Mirrors validate_response() on the live path — without it a bug in
-- the client can attach answers to another paper's questions and the results
-- screen renders questions the learner never saw.
create or replace function public.validate_practice_response()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_q_assess       uuid;
  v_attempt_assess uuid;
begin
  select assessment_id into v_q_assess
    from public.questions where id = new.question_id;

  select assessment_id into v_attempt_assess
    from public.practice_attempts where id = new.attempt_id;

  if v_q_assess is distinct from v_attempt_assess then
    raise exception 'question % does not belong to the practised assessment', new.question_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_practice_responses_validate on public.practice_responses;
create trigger trg_practice_responses_validate
  before insert or update on public.practice_responses
  for each row execute function public.validate_practice_response();

-- ─── Eligibility ────────────────────────────────────────────────────────────
-- Which E-Papers a learner may practise.
--
-- THE ONE SUBSTANTIVE DIFFERENCE from assessments_for_student is the join:
-- `enrollments`, NOT `current_enrollments`. That single word is the entire
-- promotion story. A Grade 6 learner still holds their Grade 5 enrolment row,
-- so they match last year's Grade 5 papers naturally — no `level <=` heuristic,
-- no special case for promotion. A Grade 2 learner has no Grade 5 enrolment and
-- so never sees a Grade 5 paper. A transferred learner keeps access to their
-- old school's papers, because they still hold that enrolment.
--
-- current_enrollments also filters status in ('active','repeating') and
-- exited_on is null. Using the base table deliberately drops both filters:
-- a completed or transferred_out enrolment is exactly the history we want here.
--
-- `level` is not a column on enrollments — it lives on classes, which the
-- current_enrollments view joins for us. Joining the base table means joining
-- classes explicitly.
--
-- There is no "already sat" exclusion, and that is the point: a paper you sat
-- for real is the single best thing to revise.
create or replace function public.e_papers_for_student(p_student uuid)
returns setof public.assessments
language sql
stable
security definer
set search_path = public
as $$
  select distinct a.*
    from public.assessments a
    join public.enrollments e on e.student_id = p_student
    join public.classes    c on c.id = e.class_id
   where a.deleted_at is null
     and a.status = 'closed'
     and a.e_paper_at is not null
     and (
       -- untargeted: everyone who is enrolled anywhere
       not exists (select 1 from public.assessment_targets t where t.assessment_id = a.id)
       or exists (
         select 1
           from public.assessment_targets t
          where t.assessment_id = a.id
            and (
              -- A student target matches by id alone, independent of the
              -- school/level/class columns (which the app leaves null on that
              -- row). Same shape as 14-assessment-student-target.sql — omitting
              -- it here would silently hide every individually-targeted paper.
              t.student_id = p_student
              or (
                t.student_id is null
                and (t.school_id is null or t.school_id = e.school_id)
                and (t.level     is null or t.level     = c.level)
                and (t.class_id  is null or t.class_id  = e.class_id)
              )
            )
       )
     );
$$;

grant execute on function public.e_papers_for_student(uuid) to service_role;

-- ─── Grants ─────────────────────────────────────────────────────────────────
-- Same posture as the rest of the schema: the app uses the service-role key,
-- RLS is on everywhere so the anon key can neither read nor write.
grant all privileges on public.practice_attempts  to service_role;
grant all privileges on public.practice_responses to service_role;

notify pgrst, 'reload schema';
