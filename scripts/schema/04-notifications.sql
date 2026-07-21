-- TERECO notifications. Run after 03-collection.sql.
--
-- Deliberately NOT merged with audit_log. That table is append-only and
-- immutable because it is the forensic record of who did what; notifications
-- are a delivery mechanism with mutable read state. Same events, different
-- jobs — folding them together would compromise the audit trail.

-- ─── Releasing results ──────────────────────────────────────────────────────
-- Marking being finished is a fact; releasing results is a decision. Keeping
-- them separate means an assessment can be fully marked and reviewed before
-- any learner is told.
alter table public.assessments
  add column if not exists results_released_at timestamptz,
  add column if not exists results_released_by uuid references public.profiles(id);

-- Whether every response on an assessment has been marked. Results cannot be
-- released until this is true, so a learner is never notified about a result
-- that is still half-scored. An assessment nobody has sat is not "fully
-- marked" — there is nothing to release.
create or replace function public.assessment_is_fully_marked(p_assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.assessment_submissions s
            where s.assessment_id = p_assessment
         )
     and not exists (
           select 1
             from public.responses r
             join public.assessment_submissions s on s.id = r.submission_id
            where s.assessment_id = p_assessment
              and r.score is null
         );
$$;

-- ─── Notifications ──────────────────────────────────────────────────────────
-- Audience is expressed by which of the three targeting columns are set:
--   audience_profile_id  → one person
--   audience_role        → everyone holding that role
--   audience_school_id   → everyone at that school
--   role + school        → e.g. all staff at one school
--   all three null       → everyone: a public announcement
--
-- One row serves many recipients, which is why read state cannot live here.
create table public.notifications (
  id                  bigserial primary key,
  type                text not null check (type in (
                        'lesson_filed','assessment_submitted','results_released',
                        'account_created','announcement'
                      )),
  title               text not null check (title <> ''),
  body                text not null default '',

  audience_role       text check (audience_role in
                        ('super_admin','admin','staff','student','parent')),
  audience_school_id  uuid references public.schools(id)  on delete cascade,
  audience_profile_id uuid references public.profiles(id) on delete cascade,

  -- What it is about, so the UI can link straight to it.
  entity_type         text not null default '',
  entity_id           text,
  link                text,

  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index notifications_created_idx on public.notifications (created_at desc);
create index notifications_profile_idx on public.notifications (audience_profile_id)
  where audience_profile_id is not null;
create index notifications_role_idx    on public.notifications (audience_role)
  where audience_role is not null;
create index notifications_school_idx  on public.notifications (audience_school_id)
  where audience_school_id is not null;
alter table public.notifications enable row level security;

-- ─── Read state ─────────────────────────────────────────────────────────────
-- Separate table because a single notification is delivered to many people and
-- each of them reads it (or doesn't) independently. Absence of a row means
-- unread, so nothing has to be written when a notification is created.
create table public.notification_reads (
  notification_id bigint not null references public.notifications(id) on delete cascade,
  profile_id      uuid   not null references public.profiles(id)      on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, profile_id)
);
create index notification_reads_profile_idx on public.notification_reads (profile_id);
alter table public.notification_reads enable row level security;

-- ─── Delivery ───────────────────────────────────────────────────────────────
-- Everything a given person should see, newest first, with whether they have
-- read it.
--
-- A viewer's school is NOT simply profiles.school_id: students are barred from
-- holding one (profiles_school_scope_ck), so theirs comes from their open
-- enrolment. Getting this wrong would silently deliver no school-targeted
-- notification to any student.
create or replace function public.notifications_for_profile(p_profile uuid)
returns table (
  id          bigint,
  type        text,
  title       text,
  body        text,
  entity_type text,
  entity_id   text,
  link        text,
  created_at  timestamptz,
  is_read     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select p.id,
           p.role,
           coalesce(
             p.school_id,
             (select e.school_id from public.current_enrollments e
               where e.student_id = p.id limit 1)
           ) as school_id
      from public.profiles p
     where p.id = p_profile
  )
  select n.id, n.type, n.title, n.body, n.entity_type, n.entity_id, n.link, n.created_at,
         (r.notification_id is not null) as is_read
    from public.notifications n
    cross join viewer v
    left join public.notification_reads r
           on r.notification_id = n.id and r.profile_id = v.id
   where (n.audience_profile_id is null or n.audience_profile_id = v.id)
     and (n.audience_role       is null or n.audience_role       = v.role)
     and (n.audience_school_id  is null or n.audience_school_id  = v.school_id)
   order by n.created_at desc;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on function public.assessment_is_fully_marked(uuid) to service_role;
grant execute on function public.notifications_for_profile(uuid)  to service_role;
