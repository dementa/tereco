-- Patch: brings a database created from an EARLIER 01-core.sql up to date.
--
-- Only needed if you applied 01-core.sql before the identity-photo columns and
-- the academic-year switching function were added. A database built from the
-- current 01-core.sql already has everything here.
--
-- Safe to run more than once. Safe to run on a database with data — every
-- statement is additive.
--
-- To check whether you need it:
--   select 1 from information_schema.columns
--    where table_name = 'profiles' and column_name = 'photo_url';
-- No row = run this.

-- ─── Identity photos (Cloudinary) ───────────────────────────────────────────
-- Only the delivery URL and the public_id are stored. The public_id is what
-- lets a replacement overwrite the previous asset instead of leaving an
-- orphan nobody can identify.
alter table public.profiles
  add column if not exists photo_url       text,
  add column if not exists photo_public_id text;

alter table public.schools
  add column if not exists logo_public_id text;

-- ─── Academic years cannot overlap ──────────────────────────────────────────
-- Lesson reports resolve their academic year from the lesson date, so two
-- years covering the same day would make that lookup ambiguous — and silently
-- pick one. Added conditionally because ALTER TABLE ... ADD CONSTRAINT has no
-- IF NOT EXISTS.
-- Matched on constraint TYPE ('x' = exclusion), not on a name: when this is
-- declared inline in CREATE TABLE, Postgres names it automatically
-- (academic_years_daterange_excl), so a name check would miss it and add a
-- second, duplicate constraint to an already-current database.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.academic_years'::regclass
       and contype = 'x'
  ) then
    alter table public.academic_years
      add constraint academic_years_no_overlap
      exclude using gist (daterange(starts_on, ends_on, '[]') with &&);
  end if;
end $$;

-- ─── Switching the current academic year ────────────────────────────────────
-- Two statements, deliberately. Doing this as ONE update over both rows fails
-- intermittently: Postgres checks the partial unique index per row as the
-- update proceeds, so if the scan reaches the row being switched ON before the
-- row being switched OFF, both are momentarily current and the index rejects
-- it. Which order the scan takes depends on physical row order, so a
-- single-statement version works or fails at random.
--
-- Sequential statements inside one function body are still a single
-- transaction, so this remains atomic: no caller can observe zero or two
-- current years.
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

  update public.academic_years
     set is_current = false
   where is_current and id <> p_year_id;

  update public.academic_years
     set is_current = true
   where id = p_year_id;
end;
$$;

grant execute on function public.set_current_academic_year(uuid) to service_role;

-- PostgREST caches the schema; without this the new function stays invisible
-- and calls fail with "Could not find the function ... in the schema cache".
notify pgrst, 'reload schema';
