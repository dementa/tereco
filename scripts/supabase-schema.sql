-- Full Supabase schema for TERECO.
-- Run this in the Supabase SQL editor (or via the CLI). Idempotent.
-- The app talks to Supabase with the service-role key, which bypasses RLS;
-- RLS is enabled so the anon/public key cannot read or write directly.

-- ─── Lesson submissions (DailyLessonWizard) ────────────────────────────────
create table if not exists public.lesson_records (
  id                  uuid primary key default gen_random_uuid(),
  school              text        not null,
  class_name          text        not null,
  lesson_date         date        not null,
  period              text        not null,
  status              text        not null,
  missed_reason       text        default '',
  missed_explanation  text        default '',
  learning_area       text        not null,
  specific_skill      text        not null,
  approach            text        not null,
  present             integer     not null default 0,
  absent              integer     not null default 0,
  computer_access     text        not null,
  overall_progress    text        not null,
  achievement         text        not null,
  challenges          text        not null,
  challenge_details   text        default '',
  support_required    text        default '',
  reference           text        default '',
  teacher             text        default '',
  created_at          timestamptz not null default now()
);
alter table public.lesson_records enable row level security;

-- ─── Users (staff login) ───────────────────────────────────────────────────
create table if not exists public.users (
  staff_id       text primary key,
  passcode_hash  text not null,
  name           text default '',
  role           text default '',
  school         text default '',
  created_at     timestamptz not null default now()
);
alter table public.users enable row level security;

-- ─── Assessments ───────────────────────────────────────────────────────────
create table if not exists public.assessments (
  id              text primary key,
  title           text not null,
  description     text default '',
  time_limit      integer not null default 0,
  start_time      text default '',
  target_type     text not null default 'general',
  target_value    text default '',
  questions_sheet text default '',
  deleted         boolean not null default false,
  created_at      timestamptz not null default now()
);
alter table public.assessments enable row level security;

-- ─── Questions ─────────────────────────────────────────────────────────────
create table if not exists public.questions (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  text not null references public.assessments(id) on delete cascade,
  question_id    text not null,
  question_text  text not null,
  type           text not null default 'short',
  options        text[] not null default '{}',
  correct_answer text,
  max_score      numeric not null default 1,
  config         jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists questions_assessment_id_idx on public.questions (assessment_id);
alter table public.questions enable row level security;

-- ─── Assessment responses (student submissions) ────────────────────────────
create table if not exists public.responses (
  id            uuid primary key default gen_random_uuid(),
  student_name  text not null,
  school        text default '',
  class         text default '',
  assessment_id text not null,
  question_id   text not null,
  answer        text default '',
  submitted_at  timestamptz not null default now(),
  time_spent    integer not null default 0,
  score         numeric,
  created_at    timestamptz not null default now()
);
create index if not exists responses_assessment_id_idx on public.responses (assessment_id);
alter table public.responses enable row level security;

-- ─── Grants ────────────────────────────────────────────────────────────────
-- The app connects with the service-role key. service_role bypasses RLS but
-- still needs table-level privileges; grant them explicitly so a fresh project
-- works regardless of default-privilege configuration. No grants are given to
-- anon/authenticated, so the public key cannot read or write.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
