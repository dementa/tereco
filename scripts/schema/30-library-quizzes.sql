-- Library quizzes: a multiple-choice quiz attached to a library document.
-- Run after 29-assessment-evaluation.sql.
--
-- Deliberately NOT built on the assessments tables. An assessment is a
-- scheduled, targeted, marked sitting; a library quiz is untimed practice
-- with instant feedback and no stored attempts, so it needs none of that
-- (targets, sittings, submissions, marking). Audience is inherited from the
-- library item: whoever may see the document may take its quizzes.
--
-- One document can have many quizzes. A teacher authors a quiz as a draft
-- (by hand, or by pasting AI-generated JSON), edits it, then publishes it;
-- learners only ever see published quizzes. Publishing needs no super-admin
-- review — the document itself was already approved.

create table public.library_quizzes (
  id           uuid primary key default gen_random_uuid(),
  content_id   uuid not null references public.library_content(id) on delete cascade,
  title        text not null check (btrim(title) <> ''),
  status       text not null default 'draft' check (status in ('draft','published')),
  created_by   uuid not null references public.profiles(id),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint library_quizzes_published_has_date
    check (status <> 'published' or published_at is not null)
);
create index library_quizzes_content_idx on public.library_quizzes (content_id);
alter table public.library_quizzes enable row level security;

create trigger trg_library_quizzes_updated_at
  before update on public.library_quizzes
  for each row execute function public.set_library_content_updated_at();

-- Multiple choice only, exactly one correct answer. The answer is stored as
-- an index into `options`, not as text: matching answer text by string is how
-- assessments end up with a typo that scores every learner zero (see the note
-- in 05-assessment-authoring.sql). An index cannot drift from its options
-- except by going out of range, which the check below forbids.
create table public.library_quiz_questions (
  id               uuid primary key default gen_random_uuid(),
  quiz_id          uuid not null references public.library_quizzes(id) on delete cascade,
  position         int  not null check (position >= 0),
  prompt           text not null check (btrim(prompt) <> ''),
  options          jsonb not null,
  correct_index    int  not null,
  explanation      text,
  image_url        text,
  image_public_id  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint library_quiz_questions_options_ck
    check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  constraint library_quiz_questions_correct_in_range_ck
    check (correct_index >= 0 and correct_index < jsonb_array_length(options)),
  constraint library_quiz_questions_position_unique unique (quiz_id, position) deferrable initially deferred
);
alter table public.library_quiz_questions enable row level security;

create trigger trg_library_quiz_questions_updated_at
  before update on public.library_quiz_questions
  for each row execute function public.set_library_content_updated_at();
