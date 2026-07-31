-- TERECO Library module: reading/teaching material, school-scoped upload,
-- super-admin approval, and view-only consumption. Run after 16-school-admin-role.sql.
--
-- Audience is expressed EXACTLY like assessment_targets (03-collection.sql,
-- 14-assessment-student-target.sql): a row narrows by school/grade-level/
-- class/student, and NO ROWS AT ALL means "available to everyone." There is
-- deliberately no owning-school or visibility column on library_content
-- itself — a teacher/school-admin upload gets one auto-inserted whole-school
-- target row at creation (app-layer, see lib/entities/library-content.ts),
-- and "making an item public" is simply deleting that row. This is why an
-- admin/super_admin — who has no school_id — can set targets however they
-- want, including none, and get instant platform-wide visibility.

-- ─── Content ─────────────────────────────────────────────────────────────
create table public.library_content (
  id                       uuid primary key default gen_random_uuid(),
  title                    text not null check (title <> ''),
  description              text not null default '',
  content_type             text not null check (content_type in
                             ('video','document','notes','support_file','audiobook','past_paper','presentation')),

  cloudinary_public_id     text not null,
  -- 'image' is unused by Library today (nothing here is a still image) but
  -- kept in the check for symmetry with lib/cloudinary.ts's CloudinaryResourceType.
  cloudinary_resource_type text not null check (cloudinary_resource_type in ('image','video','raw')),
  file_bytes               bigint,
  file_format              text,

  -- Automatic, not a per-item toggle: downloadability is a property of the
  -- content TYPE, decided once here, never authored per row.
  downloadable             boolean not null generated always as (content_type = 'past_paper') stored,

  -- Free-text subject tag, matching staff_assignments.learning_area
  -- (01-core.sql) — there is no learning_areas table to reference.
  learning_area            text,

  created_by               uuid not null references public.profiles(id),

  status                   text not null default 'draft'
                             check (status in ('draft','pending_approval','approved','rejected')),
  reviewed_by              uuid references public.profiles(id),
  review_reason            text,
  reviewed_at              timestamptz,
  submitted_at             timestamptz,
  archived_at              timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint library_content_review_requires_reviewer
    check (status not in ('approved','rejected') or reviewed_by is not null),
  constraint library_content_rejection_requires_reason
    check (status <> 'rejected' or (review_reason is not null and review_reason <> ''))
);
create index library_content_status_idx      on public.library_content (status);
create index library_content_created_by_idx  on public.library_content (created_by);
create index library_content_type_idx        on public.library_content (content_type);
alter table public.library_content enable row level security;

create or replace function public.set_library_content_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger trg_library_content_updated_at
  before update on public.library_content
  for each row execute function public.set_library_content_updated_at();

-- ─── Audience targeting ─────────────────────────────────────────────────
-- Identical shape and semantics to assessment_targets. NO ROWS AT ALL means
-- visible to everyone; a single row with only school_id set means "whole
-- school"; additional rows narrow further and OR together.
create table public.library_content_targets (
  id            uuid primary key default gen_random_uuid(),
  content_id    uuid not null references public.library_content(id) on delete cascade,
  school_id     uuid references public.schools(id) on delete cascade,
  level         int  references public.grade_levels(level),
  class_id      uuid references public.classes(id) on delete cascade,
  student_id    uuid references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),

  -- An all-null row would silently mean "everyone" and defeat every other
  -- target on the item. Express that by having no rows instead.
  constraint library_content_targets_not_empty_ck
    check (school_id is not null or level is not null or class_id is not null or student_id is not null)
);
create index library_content_targets_content_idx on public.library_content_targets (content_id);
create unique index library_content_targets_unique
  on public.library_content_targets (
    content_id,
    coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(level, -1),
    coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(student_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
alter table public.library_content_targets enable row level security;

-- ─── Private feedback ───────────────────────────────────────────────────
-- Visible only to the content's creator and to admin/super_admin — never to
-- other browsing users. One entry per (content, submitter): resubmitting
-- updates rather than piling up duplicates.
create table public.library_feedback (
  id            uuid primary key default gen_random_uuid(),
  content_id    uuid not null references public.library_content(id) on delete cascade,
  submitted_by  uuid not null references public.profiles(id) on delete cascade,
  rating        smallint check (rating between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint library_feedback_one_per_submitter unique (content_id, submitted_by)
);
create index library_feedback_content_idx on public.library_feedback (content_id);
alter table public.library_feedback enable row level security;

create trigger trg_library_feedback_updated_at
  before update on public.library_feedback
  for each row execute function public.set_library_content_updated_at();

-- ─── Notification types ─────────────────────────────────────────────────
-- Widens the existing notifications.type check (04-notifications.sql),
-- following the pattern in 16-school-admin-role.sql: a new sequentially
-- numbered file ALTERs the constraint rather than editing the original file
-- in place, since 16-school-admin-role.sql establishes that as the house
-- convention for widening an already-shipped inline CHECK.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'lesson_filed','assessment_submitted','results_released',
    'account_created','announcement','new_student_request','lesson_digest',
    'library_content_approved','library_content_rejected'
  ));

-- ─── Audience matching, one implementation for every consumer role ──────
-- Mirrors assessments_for_student (14-assessment-student-target.sql) but
-- generalized across all four Library consumer roles, since (unlike
-- assessments) Library is browsed by students, parents, AND teachers:
--
--   student            : matched via current_enrollments (own school/level/class),
--                        or a target naming them directly.
--   parent             : union across every linked child (parent_students),
--                        each evaluated the same way as a student.
--   staff/school_admin : broad school-level match only, same rule as
--                        canMarkAssessment in lib/auth/access.ts — any
--                        teacher at a targeted school may browse material
--                        aimed at any of their school's classes, not just
--                        the ones they personally teach.
--   admin/super_admin  : unrestricted — they author and approve everything,
--                        so scoping their own browse view would only get in
--                        the way of moderating it.
--
-- Only 'approved' content is ever returned here — draft/pending/rejected
-- items are visible solely through the authoring/approval-queue routes,
-- which query library_content directly rather than through this function.
create or replace function public.library_content_for_profile(p_profile_id uuid)
returns setof public.library_content
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_school_id uuid;
begin
  select role, school_id into v_role, v_school_id
    from public.profiles where id = p_profile_id;

  if v_role is null then
    return;
  end if;

  if v_role in ('admin','super_admin') then
    return query
      select c.* from public.library_content c where c.status = 'approved';

  elsif v_role in ('staff','school_admin') then
    return query
      select c.* from public.library_content c
       where c.status = 'approved'
         and (
           not exists (select 1 from public.library_content_targets t where t.content_id = c.id)
           or exists (
             select 1 from public.library_content_targets t
              where t.content_id = c.id and t.school_id = v_school_id
           )
         );

  elsif v_role = 'student' then
    return query
      select distinct c.*
        from public.library_content c
        join public.current_enrollments e on e.student_id = p_profile_id
       where c.status = 'approved'
         and (
           not exists (select 1 from public.library_content_targets t where t.content_id = c.id)
           or exists (
             select 1 from public.library_content_targets t
              where t.content_id = c.id
                and (
                  t.student_id = p_profile_id
                  or (
                    t.student_id is null
                    and (t.school_id is null or t.school_id = e.school_id)
                    and (t.level     is null or t.level     = e.level)
                    and (t.class_id  is null or t.class_id  = e.class_id)
                  )
                )
           )
         );

  elsif v_role = 'parent' then
    return query
      select distinct c.*
        from public.library_content c
        join public.parent_students ps on ps.parent_id = p_profile_id
        join public.current_enrollments e on e.student_id = ps.student_id
       where c.status = 'approved'
         and (
           not exists (select 1 from public.library_content_targets t where t.content_id = c.id)
           or exists (
             select 1 from public.library_content_targets t
              where t.content_id = c.id
                and (
                  t.student_id = ps.student_id
                  or (
                    t.student_id is null
                    and (t.school_id is null or t.school_id = e.school_id)
                    and (t.level     is null or t.level     = e.level)
                    and (t.class_id  is null or t.class_id  = e.class_id)
                  )
                )
           )
         );
  end if;
end;
$$;

grant execute on function public.library_content_for_profile(uuid) to service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

notify pgrst, 'reload schema';
