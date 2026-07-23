-- TERECO assessment collaborators. Run after 08-sittings.sql.
--
-- Additive: everything here can be applied to a database already holding
-- assessments.
--
-- Some admins who create an assessment are not teachers and are in no
-- position to write its questions. This lets whoever already manages an
-- assessment (its author, or any admin/super_admin) grant a specific
-- teacher access to that one assessment — to add/edit its questions and
-- mark responses — without making them a general admin or handing them
-- every other teacher's work. Deleting the assessment and releasing its
-- results stay with the original author or an admin; see
-- lib/auth/access.ts (isAssessmentOwner vs canManageAssessment).
create table public.assessment_collaborators (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  staff_id      uuid not null references public.profiles(id) on delete cascade,
  added_by      uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  unique (assessment_id, staff_id)
);
create index assessment_collaborators_staff_idx
  on public.assessment_collaborators (staff_id);
alter table public.assessment_collaborators enable row level security;
