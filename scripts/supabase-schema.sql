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
create unique index if not exists questions_assessment_id_question_id_key on public.questions (assessment_id, question_id);
alter table public.questions enable row level security;

-- ─── Students (registry of learners who take assessments) ──────────────────
create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  student_id  text default '',
  name        text not null,
  school      text not null,
  class_name  text not null,
  created_at  timestamptz not null default now()
);
create index if not exists students_school_class_idx on public.students (school, class_name);
alter table public.students enable row level security;

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

-- ─── System-generated ID sequences ──────────────────────────────────────────
-- Atomic per-entity, (optionally) per-year counters. INSERT ... ON CONFLICT DO
-- UPDATE ... RETURNING is a single statement that takes a row lock on the
-- counter row for the duration of the upsert, so concurrent callers serialize
-- through Postgres instead of racing on a value computed by counting existing
-- rows in application code (the exact bug class that produced duplicate
-- Q1/Q2 question rows earlier — see questions_assessment_id_question_id_key
-- above).
create table if not exists public.id_sequences (
  entity_type text not null,
  year        int  not null default 0, -- 0 = sentinel for non-year-scoped entities
  next_value  int  not null default 1,
  primary key (entity_type, year)
);
alter table public.id_sequences enable row level security;

create or replace function public.generate_system_id(p_entity_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix      text;
  v_year_scoped boolean;
  v_year        int;
  v_seq         int;
begin
  case p_entity_type
    when 'admin'      then v_prefix := 'TA';   v_year_scoped := true;
    when 'staff'      then v_prefix := 'TSF';  v_year_scoped := true;
    when 'student'    then v_prefix := 'TST';  v_year_scoped := true;
    when 'parent'     then v_prefix := 'TPR';  v_year_scoped := true;
    when 'school'     then v_prefix := 'TSCH'; v_year_scoped := false;
    when 'assessment' then v_prefix := 'ASS';  v_year_scoped := false;
    else raise exception 'Unknown entity_type: %', p_entity_type;
  end case;

  v_year := case when v_year_scoped then extract(year from now())::int else 0 end;

  insert into public.id_sequences (entity_type, year, next_value)
  values (p_entity_type, v_year, 2)
  on conflict (entity_type, year)
  do update set next_value = id_sequences.next_value + 1
  returning next_value - 1 into v_seq;

  if v_year_scoped then
    return v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  else
    return v_prefix || lpad(v_seq::text, 4, '0');
  end if;
end;
$$;

-- ─── Schools ─────────────────────────────────────────────────────────────
-- created_by references profiles(id), added via ALTER below once profiles
-- exists (the two tables reference each other, so one FK has to be deferred).
create table if not exists public.schools (
  id          uuid primary key default gen_random_uuid(),
  system_id   text unique not null,
  name        text unique not null,
  classes     text[] not null default '{}',
  created_at  timestamptz not null default now()
);
alter table public.schools enable row level security;

-- ─── Profiles ────────────────────────────────────────────────────────────
-- One row per authenticated human (super_admin/admin/staff/student/parent),
-- 1:1 with auth.users. Anyone who logs in has a profiles row; the old
-- `users` table (bcrypt passcodes, staff/admin only) is superseded by this.
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  system_id             text unique, -- null only for super_admin
  role                  text not null check (role in ('super_admin','admin','staff','student','parent')),
  name                  text not null default '',
  email                 text not null,
  school_id             uuid references public.schools(id),
  class_name            text, -- only meaningful for role = 'student'; matches a name in schools.classes
  must_change_password  boolean not null default true,
  is_active             boolean not null default true,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_school_idx on public.profiles (school_id);
alter table public.profiles enable row level security;

alter table public.schools add column if not exists created_by uuid references public.profiles(id);

-- Exactly one super_admin row can ever exist.
create unique index if not exists one_super_admin_idx on public.profiles ((role)) where role = 'super_admin';

-- ...and it can only ever belong to this one fixed email, even if that row is
-- ever deleted and recreated. Two independent DB-level guarantees, not just
-- app-code checks.
create or replace function public.enforce_super_admin_identity() returns trigger
language plpgsql as $$
begin
  if new.role = 'super_admin' and new.email is distinct from 'victordementa@gmail.com' then
    raise exception 'super_admin role is reserved for the fixed super admin account';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_enforce_super_admin_identity on public.profiles;
create trigger trg_enforce_super_admin_identity
before insert or update on public.profiles
for each row execute function public.enforce_super_admin_identity();

-- ─── Parent ↔ student links ─────────────────────────────────────────────
create table if not exists public.parent_students (
  parent_id  uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  primary key (parent_id, student_id)
);
alter table public.parent_students enable row level security;

-- ─── Classes & streams ───────────────────────────────────────────────────
-- Replaces the flat schools.classes text[] (which baked the stream letter
-- into the class name, e.g. 'P.1B') with real per-school class rows, each
-- optionally subdivided into streams. schools.classes / profiles.class_name
-- are left untouched for existing rows — see the migration plan notes;
-- reconciling existing students onto class_id/stream_id is a manual,
-- one-time admin action, not an automated backfill (the two schools' naming
-- conventions are genuinely ambiguous to parse safely — e.g. whether 'V' in
-- P.4V is a stream, and 'ELITE' doesn't follow the grade-number pattern at all).
create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null, -- grade level only, e.g. 'P.1' — no stream suffix
  has_streams boolean not null default false,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create unique index if not exists classes_school_name_key on public.classes (school_id, lower(name));
alter table public.classes enable row level security;

create table if not exists public.streams (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  name       text not null, -- e.g. 'A', 'B'
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists streams_class_name_key on public.streams (class_id, lower(name));
alter table public.streams enable row level security;

-- ─── Schools: contact details ────────────────────────────────────────────
alter table public.schools add column if not exists location       text default '';
alter table public.schools add column if not exists contact_email  text;
alter table public.schools add column if not exists contact_person text default '';
alter table public.schools add column if not exists contact_number text default '';

-- ─── Wire existing tables to the new identity model ─────────────────────
-- Additive only: nullable FKs populated going forward, no backfill of
-- historical free-text rows in this pass.
alter table public.students       add column if not exists profile_id uuid references public.profiles(id);
alter table public.students       add column if not exists school_id  uuid references public.schools(id);
alter table public.assessments    add column if not exists created_by uuid references public.profiles(id);
alter table public.responses      add column if not exists student_id uuid references public.profiles(id);
alter table public.responses      add column if not exists school_id  uuid references public.schools(id);
alter table public.lesson_records add column if not exists teacher_id uuid references public.profiles(id);
alter table public.lesson_records add column if not exists school_id  uuid references public.schools(id);
alter table public.lesson_records add column if not exists class_id   uuid references public.classes(id);
alter table public.lesson_records add column if not exists stream_id  uuid references public.streams(id);

-- ─── Profiles: names, DOB, contact email, structured class/stream ───────
-- email stays NOT NULL — it's the Supabase Auth identifier (real or, for
-- students without one yet, a system-generated placeholder invisible
-- everywhere else). contact_email is the only human-facing "email on file"
-- for every role, and is genuinely nullable.
alter table public.profiles add column if not exists first_name    text;
alter table public.profiles add column if not exists middle_name   text;
alter table public.profiles add column if not exists last_name     text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists contact_email text;
alter table public.profiles add column if not exists class_id      uuid references public.classes(id);
alter table public.profiles add column if not exists stream_id     uuid references public.streams(id);
create index if not exists profiles_class_idx on public.profiles (class_id);

-- The actual fix for repeat assessment submissions: once a submission carries
-- a real verified student_id (instead of free-text student_name), a second
-- submit attempt for the same assessment is rejected at the database level.
-- Must include question_id — a single submission inserts one row per
-- question, all sharing the same (assessment_id, student_id); constraining
-- on just those two columns made a multi-question assessment's very first
-- submission collide with itself. (assessment_id, student_id, question_id)
-- still blocks a genuine resubmission while allowing the one-row-per-question
-- shape of a real submission.
drop index if exists responses_assessment_student_unique;
create unique index if not exists responses_assessment_student_question_unique
  on public.responses (assessment_id, student_id, question_id) where student_id is not null;

-- ─── One-time seed: existing SCHOOLS constant (lib/constants.tsx) ───────
insert into public.schools (system_id, name, classes)
values
  (public.generate_system_id('school'), 'Ebenezer Standard Junior School',
   array['P.1B','P.1C','P.1S','P.2B','P.2C','P.2S','P.3B','P.3C','P.3S','P.4B','P.4V','P.4S','P.5B','P.5V','P.5S','P.6B','P.6V']),
  (public.generate_system_id('school'), 'Little Pines Junior School',
   array['J1A','J1B','J2','J3A','J3B','J4','J5','J6','ELITE'])
on conflict (name) do nothing;

-- ─── Grants ────────────────────────────────────────────────────────────────
-- The app connects with the service-role key. service_role bypasses RLS but
-- still needs table-level privileges; grant them explicitly so a fresh project
-- works regardless of default-privilege configuration. No grants are given to
-- anon/authenticated, so the public key cannot read or write.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on function public.generate_system_id(text) to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
