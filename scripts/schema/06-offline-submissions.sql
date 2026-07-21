-- TERECO offline submissions. Run after 05-assessment-authoring.sql.
--
-- Lets a learner sit a paper on paper: download it, write on it, photograph or
-- scan every page, and upload it before the assessment closes. Additive.

-- ─── How a paper was sat ────────────────────────────────────────────────────
alter table public.assessment_submissions
  add column if not exists mode text not null default 'online'
    check (mode in ('online', 'scanned'));

-- ─── The uploaded pages ─────────────────────────────────────────────────────
-- A separate table rather than a single column on the submission: a paper runs
-- to several pages, and a phone camera produces one image per page. Storing one
-- URL would force learners to stitch pages together themselves, which is
-- exactly the step that gets done badly or not at all.
create table public.submission_scans (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.assessment_submissions(id) on delete cascade,
  page_number   int  not null check (page_number > 0),
  url           text not null,
  public_id     text not null,
  uploaded_at   timestamptz not null default now(),

  -- One image per page, so re-uploading page 2 replaces it rather than
  -- silently adding a second page 2 nobody can tell apart.
  unique (submission_id, page_number)
);
create index submission_scans_submission_idx
  on public.submission_scans (submission_id, page_number);
alter table public.submission_scans enable row level security;

-- A scan only belongs on a submission that was actually sat on paper.
create or replace function public.validate_submission_scan()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_mode text;
begin
  select mode into v_mode
    from public.assessment_submissions
   where id = new.submission_id;

  if v_mode is distinct from 'scanned' then
    raise exception 'submission % was not sat on paper; scans cannot be attached', new.submission_id;
  end if;

  return new;
end;
$$;

create trigger trg_submission_scans_mode
  before insert or update on public.submission_scans
  for each row execute function public.validate_submission_scan();

grant all privileges on all tables in schema public to service_role;
grant execute on function public.validate_submission_scan() to service_role;
