-- TERECO collection schema — lesson reports, assessments, responses.
-- Run after 01-core.sql and 02-audit.sql.
--
-- This is the half of the system that records what actually happened. Every
-- table here is TIME-SCOPED, which is the whole reason it could not be written
-- until the core settled: a record of a lesson or an answer belongs to a
-- specific class, in a specific term, for a specific enrolment span. It must
-- keep meaning that after the student is promoted, the teacher moves class, or
-- the school renames P.4 to "J4".
--
-- What that rules out, and what the previous version of these tables did:
--   * storing the school as `school text` and the class as `class_name text`
--   * targeting an assessment with `target_value = 'Nairobi Academy|Form 3A'`
-- Both silently detach from reality the moment anything is renamed, and neither
-- can be joined, indexed, or constrained. Everything below goes through the
-- real keys instead.

-- ─── Lesson reports ─────────────────────────────────────────────────────────
-- One row per (class/stream, date, period). The teacher is a profile, the
-- class is a class, and the term is resolved from the date at insert time.
create table public.lesson_reports (
  id               uuid primary key default gen_random_uuid(),

  -- Attribution. staff_id is the teacher who taught it; it is taken from the
  -- verified session, never from the request body.
  staff_id         uuid not null references public.profiles(id),
  school_id        uuid not null references public.schools(id),
  class_id         uuid not null references public.classes(id),
  stream_id        uuid references public.streams(id),
  academic_year_id uuid not null references public.academic_years(id),
  -- Nullable: a school that has not defined its terms yet can still file
  -- reports, and term_for_date() backfills them later. Better than refusing
  -- the day's work over calendar admin.
  term_id          uuid references public.terms(id),

  lesson_date      date not null,
  -- 'Period 1'..'Period 8' in the wizard; stored as the number it always was.
  period           int  not null check (period between 1 and 8),

  status           text not null check (status in ('Completed','Partially Completed','Missed')),
  missed_reason      text not null default '',
  missed_explanation text not null default '',

  learning_area    text not null,
  specific_skill   text not null,
  approach         text not null,

  present          int not null default 0 check (present >= 0),
  absent           int not null default 0 check (absent  >= 0),

  computer_access  text not null check (computer_access in (
                     'Full access — 1 computer per learner',
                     'Shared — 2–3 learners per computer',
                     'Limited — 4+ per computer',
                     'No computer access'
                   )),
  overall_progress text not null check (overall_progress in (
                     'Excellent','Good','Satisfactory','Needs improvement','Poor'
                   )),
  achievement      text not null default '',

  -- Was 'Yes'/'No' text. A boolean cannot be spelled two ways.
  had_challenges   boolean not null default false,
  challenge_details text not null default '',
  support_required  text not null default '',

  reference        text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- A missed lesson has nobody in it and owes an explanation. A lesson that
  -- happened does not carry a missed reason. Enforced rather than trusted to
  -- the wizard's client-side validation, which is one `curl` away from bypass.
  constraint lesson_reports_missed_ck check (
    case when status = 'Missed'
         then present = 0 and absent = 0 and missed_reason <> ''
         else missed_reason = '' and missed_explanation = ''
    end
  ),
  -- If you ticked "challenges faced", say what they were.
  constraint lesson_reports_challenges_ck check (
    not had_challenges or challenge_details <> ''
  )
);

-- One report per class/stream per period per day. This is what stops a double
-- submit (or a refresh) from quietly producing two conflicting records of the
-- same lesson. Streams are optional, so the null case gets its own index
-- rather than being lost to null-is-not-equal.
create unique index lesson_reports_slot_key
  on public.lesson_reports (class_id, stream_id, lesson_date, period)
  where stream_id is not null;
create unique index lesson_reports_slot_nostream_key
  on public.lesson_reports (class_id, lesson_date, period)
  where stream_id is null;

create index lesson_reports_staff_idx  on public.lesson_reports (staff_id, lesson_date desc);
create index lesson_reports_school_idx on public.lesson_reports (school_id, lesson_date desc);
create index lesson_reports_term_idx   on public.lesson_reports (term_id);
create index lesson_reports_date_idx   on public.lesson_reports (lesson_date desc);
alter table public.lesson_reports enable row level security;

-- The stream must belong to the class it is filed under, and the class to the
-- school. Foreign keys alone allow a P.4 report to name a stream from P.7.
create or replace function public.validate_class_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_school uuid;
begin
  select school_id into v_school from public.classes where id = new.class_id;
  if v_school is distinct from new.school_id then
    raise exception 'class % does not belong to school %', new.class_id, new.school_id;
  end if;

  if new.stream_id is not null then
    if not exists (
      select 1 from public.streams where id = new.stream_id and class_id = new.class_id
    ) then
      raise exception 'stream % does not belong to class %', new.stream_id, new.class_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_lesson_reports_hierarchy
  before insert or update on public.lesson_reports
  for each row execute function public.validate_class_hierarchy();

-- The same rule protects enrolments, which had the same hole.
create trigger trg_enrollments_hierarchy
  before insert or update on public.enrollments
  for each row execute function public.validate_class_hierarchy();

-- Resolve the term from the lesson date, so callers cannot file a report into
-- the wrong term by passing one.
create or replace function public.set_lesson_report_term()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.term_id := public.term_for_date(new.school_id, new.lesson_date);
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_lesson_reports_term
  before insert or update on public.lesson_reports
  for each row execute function public.set_lesson_report_term();

-- ─── Assessments ────────────────────────────────────────────────────────────
create table public.assessments (
  id                 uuid primary key default gen_random_uuid(),
  system_id          text unique not null,   -- ASS0001, from generate_system_id('assessment')
  title              text not null check (title <> ''),
  description        text not null default '',
  time_limit_minutes int  not null check (time_limit_minutes > 0),

  -- A window, not a single start time. Closing an assessment is a date, not an
  -- admin remembering to flip a flag.
  opens_at           timestamptz,
  closes_at          timestamptz,

  status             text not null default 'draft'
                       check (status in ('draft','published','closed')),

  academic_year_id   uuid references public.academic_years(id),
  term_id            uuid references public.terms(id),

  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Soft delete: responses reference assessments, and deleting an assessment
  -- must never take a student's answers with it.
  deleted_at         timestamptz,

  check (closes_at is null or opens_at is null or closes_at > opens_at)
);
create index assessments_status_idx on public.assessments (status) where deleted_at is null;
create index assessments_window_idx on public.assessments (opens_at, closes_at);
alter table public.assessments enable row level security;

-- ─── Assessment targeting ───────────────────────────────────────────────────
-- Replaces target_type/target_value (which encoded a school and class as one
-- pipe-delimited string). Each row narrows the audience by school, by grade
-- level, by specific class, or any combination of the three.
--
-- NO ROWS AT ALL = available to every student. That is the "general" case, and
-- it needs no sentinel value.
create table public.assessment_targets (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  school_id     uuid references public.schools(id) on delete cascade,
  level         int  references public.grade_levels(level),
  class_id      uuid references public.classes(id) on delete cascade,
  created_at    timestamptz not null default now(),

  -- An all-null row would silently mean "everyone" and defeat every other
  -- target on the assessment. Express that by having no rows.
  constraint assessment_targets_not_empty_ck
    check (school_id is not null or level is not null or class_id is not null)
);
create index assessment_targets_assessment_idx on public.assessment_targets (assessment_id);
create unique index assessment_targets_unique
  on public.assessment_targets (
    assessment_id,
    coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(level, -1),
    coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
alter table public.assessment_targets enable row level security;

-- Which assessments a given student may currently sit. Targeting lives here,
-- in one place, instead of being re-implemented by every caller that used to
-- split target_value on '|'.
create or replace function public.assessments_for_student(p_student uuid)
returns setof public.assessments
language sql
stable
security definer
set search_path = public
as $$
  select a.*
    from public.assessments a
    join public.current_enrollments e on e.student_id = p_student
   where a.deleted_at is null
     and a.status = 'published'
     and (a.opens_at  is null or a.opens_at  <= now())
     and (a.closes_at is null or a.closes_at >  now())
     and (
       -- untargeted: everyone
       not exists (select 1 from public.assessment_targets t where t.assessment_id = a.id)
       or exists (
         select 1
           from public.assessment_targets t
          where t.assessment_id = a.id
            and (t.school_id is null or t.school_id = e.school_id)
            and (t.level     is null or t.level     = e.level)
            and (t.class_id  is null or t.class_id  = e.class_id)
       )
     );
$$;

-- ─── Questions ──────────────────────────────────────────────────────────────
create table public.questions (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references public.assessments(id) on delete cascade,
  -- Explicit ordering. The previous version ordered by created_at, so a
  -- re-saved question silently jumped to the end of the paper.
  position       int  not null check (position > 0),
  code           text not null check (code <> ''),   -- 'Q1', shown to the student
  question_text  text not null check (question_text <> ''),
  type           text not null check (type in (
                   'mcq','checkbox','fill','matching','dragdrop','short','long'
                 )),
  options        jsonb not null default '[]'::jsonb,
  correct_answer text,
  max_score      numeric(6,2) not null default 1 check (max_score > 0),
  config         jsonb,
  created_at     timestamptz not null default now(),

  unique (assessment_id, position),
  unique (assessment_id, code),

  constraint questions_options_is_array_ck check (jsonb_typeof(options) = 'array'),
  -- A multiple-choice question with no choices is not answerable.
  constraint questions_choices_ck check (
    type not in ('mcq','checkbox') or jsonb_array_length(options) > 0
  ),
  -- Auto-scored types must know what "right" is, or every answer scores zero.
  constraint questions_answerable_ck check (
    type not in ('mcq','checkbox','fill')
    or (correct_answer is not null and correct_answer <> '')
  )
);
create index questions_assessment_idx on public.questions (assessment_id, position);
alter table public.questions enable row level security;

-- ─── Submissions ────────────────────────────────────────────────────────────
-- One row per student per assessment: the sitting itself. Splitting this from
-- the individual answers is what makes "you have already submitted this" a
-- database guarantee rather than a race between two in-flight requests.
create table public.assessment_submissions (
  id                  uuid primary key default gen_random_uuid(),
  assessment_id       uuid not null references public.assessments(id) on delete cascade,
  student_id          uuid not null references public.profiles(id) on delete cascade,

  -- The enrolment the student was sitting under. This is the point of the
  -- whole design: the answers stay attached to the class they were in on the
  -- day, so promoting or transferring them cannot rewrite the result.
  enrollment_id       uuid not null references public.enrollments(id),

  started_at          timestamptz,
  submitted_at        timestamptz not null default now(),
  time_spent_seconds  int not null default 0 check (time_spent_seconds >= 0),

  -- Maintained by trigger from the responses; never written by the app.
  total_score         numeric(8,2),
  max_score           numeric(8,2),

  status              text not null default 'submitted'
                        check (status in ('in_progress','submitted','marked')),
  marked_by           uuid references public.profiles(id),
  marked_at           timestamptz,

  unique (assessment_id, student_id)
);
create index assessment_submissions_assessment_idx on public.assessment_submissions (assessment_id);
create index assessment_submissions_student_idx    on public.assessment_submissions (student_id);
alter table public.assessment_submissions enable row level security;

-- The submission's enrolment must actually be that student's.
create or replace function public.validate_submission_enrollment()
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

create trigger trg_submissions_enrollment
  before insert or update on public.assessment_submissions
  for each row execute function public.validate_submission_enrollment();

-- ─── Responses ──────────────────────────────────────────────────────────────
create table public.responses (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.assessment_submissions(id) on delete cascade,
  question_id    uuid not null references public.questions(id) on delete cascade,
  answer         text not null default '',
  -- null = not yet marked. Distinct from 0, which means marked and wrong.
  score          numeric(6,2) check (score >= 0),
  is_auto_scored boolean not null default false,
  marked_by      uuid references public.profiles(id),
  marked_at      timestamptz,
  created_at     timestamptz not null default now(),

  unique (submission_id, question_id)
);
create index responses_submission_idx on public.responses (submission_id);
create index responses_question_idx   on public.responses (question_id);
alter table public.responses enable row level security;

-- A response may only answer a question belonging to the assessment it was
-- submitted for, and may not score above that question's maximum.
create or replace function public.validate_response()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max        numeric(6,2);
  v_q_assess   uuid;
  v_sub_assess uuid;
begin
  select max_score, assessment_id into v_max, v_q_assess
    from public.questions where id = new.question_id;

  select assessment_id into v_sub_assess
    from public.assessment_submissions where id = new.submission_id;

  if v_q_assess is distinct from v_sub_assess then
    raise exception 'question % does not belong to the submitted assessment', new.question_id;
  end if;

  if new.score is not null and new.score > v_max then
    raise exception 'score % exceeds the question maximum of %', new.score, v_max;
  end if;

  return new;
end;
$$;

create trigger trg_responses_validate
  before insert or update on public.responses
  for each row execute function public.validate_response();

-- Keep the submission's totals true to its responses, so no code path can
-- report a score that its own answers do not add up to.
create or replace function public.recalc_submission_score()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_submission uuid := coalesce(new.submission_id, old.submission_id);
begin
  update public.assessment_submissions s
     set total_score = sub.total,
         max_score   = sub.max,
         status      = case
                         when sub.unmarked = 0 and sub.answers > 0 then 'marked'
                         when s.status = 'in_progress' then 'in_progress'
                         else 'submitted'
                       end
    from (
      select coalesce(sum(r.score), 0)                      as total,
             coalesce(sum(q.max_score), 0)                  as max,
             count(*) filter (where r.score is null)        as unmarked,
             count(*)                                       as answers
        from public.responses r
        join public.questions q on q.id = r.question_id
       where r.submission_id = v_submission
    ) sub
   where s.id = v_submission;

  return null;
end;
$$;

create trigger trg_responses_recalc
  after insert or update or delete on public.responses
  for each row execute function public.recalc_submission_score();

-- ─── Grants ─────────────────────────────────────────────────────────────────
-- Same posture as the core: the app uses the service-role key, RLS is on
-- everywhere so the anon/public key can neither read nor write.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on function public.assessments_for_student(uuid) to service_role;
