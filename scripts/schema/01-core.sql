-- TERECO core schema — identity, school structure, academic calendar.
-- Run this in the Supabase SQL editor against a fresh database.
--
-- Scope: this file builds the entities everything else hangs off. The
-- collection tables (lesson_reports, assessments, questions, responses) are
-- deliberately NOT here — they are time-scoped and must reference enrollments
-- and terms, so they live in 03-collection.sql, applied last.
--
-- Apply order: 01-core.sql -> 02-audit.sql -> 03-collection.sql.
-- (00-local-stubs.sql is LOCAL ONLY — it fakes the auth schema and the
-- anon/authenticated/service_role roles so these files can be applied to a
-- plain Postgres for type generation. Never run it against Supabase, which
-- provides all of that already.)
--
-- The app talks to Supabase with the service-role key, which bypasses RLS;
-- RLS is enabled everywhere so the anon/public key cannot read or write.

create extension if not exists btree_gist;

-- ─── System-generated ID sequences ──────────────────────────────────────────
-- Atomic per-entity, (optionally) per-year counters. INSERT ... ON CONFLICT DO
-- UPDATE ... RETURNING is a single statement that takes a row lock on the
-- counter row for the duration of the upsert, so concurrent callers serialize
-- through Postgres instead of racing on a value computed by counting existing
-- rows in application code.
create table public.id_sequences (
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

-- ─── Academic years ─────────────────────────────────────────────────────────
-- Global, not per-school. This is the shared axis every school's data rolls up
-- to, which is what makes cross-school comparison possible at all. Term counts
-- and dates vary by school (see terms below) — the YEAR does not.
create table public.academic_years (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,   -- '2026'
  starts_on  date not null,
  ends_on    date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on),

  -- Academic years cannot overlap. Lesson reports resolve their year from the
  -- lesson date, so two years covering the same day would make that lookup
  -- ambiguous — and silently pick one.
  exclude using gist (daterange(starts_on, ends_on, '[]') with &&)
);
-- At most one year flagged current at a time.
create unique index academic_years_one_current_idx
  on public.academic_years ((is_current)) where is_current;
alter table public.academic_years enable row level security;

-- Switching the current year must clear the old one and set the new one in a
-- single statement. Doing it as two updates from the app trips the unique
-- index above (or, worse, leaves no current year if the second one fails).
create or replace function public.set_current_academic_year(p_year_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.academic_years where id = p_year_id) then
    raise exception 'academic year % does not exist', p_year_id;
  end if;

  -- Two statements, deliberately. Doing this as ONE update over both rows
  -- fails intermittently: Postgres checks the partial unique index per row as
  -- the update proceeds, so if the scan reaches the row being switched ON
  -- before the row being switched OFF, both are momentarily current and the
  -- index rejects it. Which order the scan takes depends on physical row
  -- order, so the single-statement version works or fails at random.
  --
  -- Sequential statements inside one function body are still a single
  -- transaction, so this remains atomic: no caller can observe zero or two
  -- current years.
  update public.academic_years
     set is_current = false
   where is_current and id <> p_year_id;

  update public.academic_years
     set is_current = true
   where id = p_year_id;
end;
$$;

-- ─── Grade levels ───────────────────────────────────────────────────────────
-- The canonical ladder, fixed at P.1–P.7. A school may call level 1 'J1' or
-- anything else (see classes.alias), but analysis always groups on `level`.
-- Without this, 'P.1' at one school and 'J1' at another are unjoinable strings
-- and programme-wide reporting is impossible.
create table public.grade_levels (
  level      int primary key check (level between 1 and 7),
  code       text not null unique,   -- 'P.1'
  name       text not null           -- 'Primary 1'
);
alter table public.grade_levels enable row level security;

insert into public.grade_levels (level, code, name) values
  (1, 'P.1', 'Primary 1'),
  (2, 'P.2', 'Primary 2'),
  (3, 'P.3', 'Primary 3'),
  (4, 'P.4', 'Primary 4'),
  (5, 'P.5', 'Primary 5'),
  (6, 'P.6', 'Primary 6'),
  (7, 'P.7', 'Primary 7');

-- ─── Schools ────────────────────────────────────────────────────────────────
-- contact_profile_id is the school's contact person. They are a normal
-- profiles row with role 'staff' scoped to this school, so when you're ready
-- to give them access you just activate the account — no schema change and no
-- separate identity concept. FK added after profiles exists (mutual reference).
create table public.schools (
  id             uuid primary key default gen_random_uuid(),
  system_id      text unique not null,
  name           text unique not null,
  location       text not null default '',
  logo_url       text,   -- Cloudinary delivery URL
  logo_public_id text,   -- Cloudinary public_id, for replacing/destroying the old asset
  phone          text not null default '',
  email          text,
  joined_on      date,   -- when this school came onto the programme; reports
                         -- before this date are legitimately empty, not missing
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
alter table public.schools enable row level security;

-- ─── Profiles ───────────────────────────────────────────────────────────────
-- One row per authenticated human, 1:1 with auth.users. This is the identity
-- spine — there is no separate Student/Staff/Admin/Parent PK table, because
-- Supabase Auth needs exactly one answer to "who is logged in".
--
-- school_id semantics by role — read this before writing any query:
--   super_admin : null (TERECO-wide)
--   admin       : null (TERECO-wide, by design)
--   staff       : the school they work at
--   parent      : null — derive via parent_students -> enrollments
--   student     : null — ALWAYS derive via enrollments. A student can change
--                 school mid-year; a school_id here would silently rewrite
--                 which school their historical data belongs to.
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  system_id            text unique,   -- null only for super_admin
  role                 text not null check (role in ('super_admin','admin','staff','student','parent')),
  first_name           text not null default '',
  middle_name          text,
  last_name            text not null default '',
  gender               text check (gender in ('male','female')),
  date_of_birth        date,
  email                text not null,   -- Supabase Auth identifier; may be a
                                        -- generated placeholder for students
  contact_email        text,            -- the human-facing email on file
  phone_primary        text,
  phone_secondary      text,
  -- Identity photo, hosted on Cloudinary. Only the delivery URL is stored:
  -- the file itself never touches this database, and a broken/removed image
  -- must never be able to break a profile row.
  photo_url            text,
  photo_public_id      text,             -- Cloudinary public_id, needed to replace/destroy the old asset
  school_id            uuid references public.schools(id),  -- see note above
  department           text,
  must_change_password boolean not null default true,
  is_active            boolean not null default true,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index profiles_role_idx   on public.profiles (role);
create index profiles_school_idx on public.profiles (school_id);
create index profiles_name_idx   on public.profiles (lower(last_name), lower(first_name));
alter table public.profiles enable row level security;

-- Students and TERECO-wide admins must not carry a school_id — it is derived
-- for students and meaningless for admins. Enforced, not just documented.
alter table public.profiles add constraint profiles_school_scope_ck check (
  case
    when role in ('super_admin','admin','student') then school_id is null
    else true
  end
);

alter table public.schools
  add column contact_profile_id uuid references public.profiles(id),
  add column created_by         uuid references public.profiles(id);

-- Exactly one super_admin row can ever exist...
create unique index one_super_admin_idx on public.profiles ((role)) where role = 'super_admin';

-- ...and it can only ever belong to this one fixed email, even if that row is
-- deleted and recreated. Two independent DB-level guarantees, not app checks.
create or replace function public.enforce_super_admin_identity() returns trigger
language plpgsql as $$
begin
  if new.role = 'super_admin' and new.email is distinct from 'victordementa@gmail.com' then
    raise exception 'super_admin role is reserved for the fixed super admin account';
  end if;
  return new;
end;
$$;
create trigger trg_enforce_super_admin_identity
  before insert or update on public.profiles
  for each row execute function public.enforce_super_admin_identity();

-- ─── Terms ──────────────────────────────────────────────────────────────────
-- Per-school, because a school on the programme may run two terms where
-- another runs three. A two-term school simply has two rows: it is ABSENT from
-- a Term 3 report rather than showing up as a zero.
create table public.terms (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  number           int  not null check (number between 1 and 3),
  name             text not null default '',   -- 'Term 1'
  starts_on        date not null,
  ends_on          date not null,
  created_at       timestamptz not null default now(),
  unique (school_id, academic_year_id, number),
  check (ends_on > starts_on),
  -- A school's terms within a year cannot overlap.
  exclude using gist (
    school_id        with =,
    academic_year_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  )
);
create index terms_year_idx on public.terms (academic_year_id);
alter table public.terms enable row level security;

-- Resolve a date to the term it falls in, for a given school. Collection
-- tables store the resolved term_id at write time rather than joining on date
-- ranges at read time; see reconcile_terms() for when term dates get corrected.
create or replace function public.term_for_date(p_school_id uuid, p_date date)
returns uuid
language sql
stable
as $$
  select id from public.terms
   where school_id = p_school_id
     and p_date between starts_on and ends_on
   limit 1;
$$;

-- ─── Classes ────────────────────────────────────────────────────────────────
-- A class is a school's instance of a grade level. `level` is the canonical
-- join key; `alias` is what this school actually calls it ('J1', 'Grade 1').
-- Display name is coalesce(alias, grade_levels.code).
--
-- level is nullable for classes that genuinely sit outside the ladder (e.g.
-- 'ELITE'). Those are excluded from level-based comparison rather than being
-- forced into a grade they don't belong to.
create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  level       int references public.grade_levels(level),
  alias       text,
  has_streams boolean not null default false,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  -- Either it maps to a grade level, or it must name itself.
  check (level is not null or alias is not null)
);
-- One class per grade level per school.
create unique index classes_school_level_key on public.classes (school_id, level)
  where level is not null;
create unique index classes_school_alias_key on public.classes (school_id, lower(alias))
  where level is null;
alter table public.classes enable row level security;

-- ─── Streams ────────────────────────────────────────────────────────────────
-- Soft-deleted only. Enrollments reference streams historically, so a school
-- tidying up its stream list must never cascade away years of records.
create table public.streams (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  name       text not null,   -- 'A', 'Bright', 'Clever'
  is_active  boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index streams_class_name_key on public.streams (class_id, lower(name));
alter table public.streams enable row level security;

-- ─── Enrollments ────────────────────────────────────────────────────────────
-- THE central table. A student is not "in" a class — a student is enrolled in
-- a class, at a school, for a span of time. Every time-scoped record
-- (lesson reports, assessment responses) resolves its school/class/stream
-- through here, which is what preserves history when a student is promoted or
-- transfers.
create table public.enrollments (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles(id) on delete cascade,
  school_id        uuid not null references public.schools(id),
  class_id         uuid not null references public.classes(id),
  stream_id        uuid references public.streams(id),
  academic_year_id uuid not null references public.academic_years(id),
  status           text not null default 'active'
                     check (status in ('active','completed','transferred_out','withdrawn','repeating')),
  enrolled_on      date not null,
  exited_on        date,   -- null = still enrolled
  exit_reason      text,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  check (exited_on is null or exited_on >= enrolled_on),

  -- A student cannot be enrolled in two places at once, ever. This is why
  -- "student changes school at any time" is safe: you close one span and open
  -- the next, and overlapping spans are rejected by the database.
  exclude using gist (
    student_id with =,
    daterange(enrolled_on, coalesce(exited_on, 'infinity'::date), '[)') with &&
  )
);
create index enrollments_student_idx on public.enrollments (student_id);
create index enrollments_year_idx    on public.enrollments (academic_year_id);
create index enrollments_class_idx   on public.enrollments (class_id, stream_id);
create index enrollments_school_idx  on public.enrollments (school_id, academic_year_id);
alter table public.enrollments enable row level security;

-- Current placement, for UI and simple lookups. Use this instead of caching
-- class_id/stream_id back onto profiles, where it would go stale silently.
create view public.current_enrollments as
  select e.*,
         c.level,
         coalesce(c.alias, g.code) as class_display_name,
         s.name                    as stream_name
    from public.enrollments e
    join public.classes c            on c.id = e.class_id
    left join public.grade_levels g  on g.level = c.level
    left join public.streams s       on s.id = e.stream_id
   where e.exited_on is null
     and e.status in ('active','repeating');

-- ─── Staff assignments ──────────────────────────────────────────────────────
-- Which teacher was responsible for which class/stream, in which year. Same
-- reasoning as enrollments: a teacher who moves from P.3 to P.5 must not
-- rewrite the attribution on their previous lesson reports.
create table public.staff_assignments (
  id               uuid primary key default gen_random_uuid(),
  staff_id         uuid not null references public.profiles(id) on delete cascade,
  school_id        uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  class_id         uuid references public.classes(id),
  stream_id        uuid references public.streams(id),
  learning_area    text,
  is_class_teacher boolean not null default false,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now()
);
-- NULLS NOT DISTINCT matters here: class_id/stream_id/learning_area are all
-- nullable, and under default NULL handling a unique index would treat every
-- null as unique and let exact duplicate assignments through.
create unique index staff_assignments_unique_key
  on public.staff_assignments (staff_id, academic_year_id, class_id, stream_id, learning_area)
  nulls not distinct;
create index staff_assignments_class_idx on public.staff_assignments (class_id, academic_year_id);
alter table public.staff_assignments enable row level security;

-- ─── Parent ↔ student links ─────────────────────────────────────────────────
-- Many-to-many and NOT school-scoped: a parent may have children at different
-- schools. The parent's school affiliation is derived through the child's
-- enrollment, never stored on the parent.
create table public.parent_students (
  parent_id    uuid not null references public.profiles(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  relationship text,   -- 'mother', 'father', 'guardian'
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (parent_id, student_id)
);
create index parent_students_student_idx on public.parent_students (student_id);
alter table public.parent_students enable row level security;

-- ─── Grants ─────────────────────────────────────────────────────────────────
-- The app connects with the service-role key. service_role bypasses RLS but
-- still needs table-level privileges; grant them explicitly so a fresh project
-- works regardless of default-privilege configuration. No grants to
-- anon/authenticated, so the public key cannot read or write.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on function public.generate_system_id(text) to service_role;
grant execute on function public.term_for_date(uuid, date) to service_role;
grant execute on function public.set_current_academic_year(uuid) to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
