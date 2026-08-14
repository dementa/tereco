-- One-off data cleanup, not a schema migration: collapses an immediately-
-- repeated word in a student's name (e.g. "WILLIAM WILLIAM" -> "WILLIAM")
-- and normalizes case to ALL CAPS, matching the convention the other 1,132
-- student records already use. Scoped to role = 'student' only.
--
-- Run each step in order in the Supabase SQL editor.

-- 1. Backup — snapshot every row this will touch, before touching it.
create table if not exists public.profiles_name_fix_backup (
  id          uuid primary key,
  system_id   text,
  first_name  text,
  middle_name text,
  last_name   text,
  backed_up_at timestamptz not null default now()
);

insert into public.profiles_name_fix_backup (id, system_id, first_name, middle_name, last_name)
select id, system_id, first_name, middle_name, last_name
  from public.profiles
 where role = 'student'
   and (
     first_name  is distinct from upper(regexp_replace(trim(first_name),  '(\S+)(\s+\1)+', '\1', 'gi'))
     or middle_name is distinct from upper(regexp_replace(trim(middle_name), '(\S+)(\s+\1)+', '\1', 'gi'))
     or last_name  is distinct from upper(regexp_replace(trim(last_name),  '(\S+)(\s+\1)+', '\1', 'gi'))
   );

-- 2. Preview — eyeball before/after for every row that will change.
select
  system_id,
  first_name  as first_before,  upper(regexp_replace(trim(first_name),  '(\S+)(\s+\1)+', '\1', 'gi')) as first_after,
  middle_name as middle_before, upper(regexp_replace(trim(middle_name), '(\S+)(\s+\1)+', '\1', 'gi')) as middle_after,
  last_name   as last_before,   upper(regexp_replace(trim(last_name),   '(\S+)(\s+\1)+', '\1', 'gi')) as last_after
from public.profiles
where role = 'student'
  and (
    first_name  is distinct from upper(regexp_replace(trim(first_name),  '(\S+)(\s+\1)+', '\1', 'gi'))
    or middle_name is distinct from upper(regexp_replace(trim(middle_name), '(\S+)(\s+\1)+', '\1', 'gi'))
    or last_name  is distinct from upper(regexp_replace(trim(last_name),  '(\S+)(\s+\1)+', '\1', 'gi'))
  )
order by system_id;

-- 3. Apply.
update public.profiles
set
  first_name  = upper(regexp_replace(trim(first_name),  '(\S+)(\s+\1)+', '\1', 'gi')),
  middle_name = upper(regexp_replace(trim(middle_name), '(\S+)(\s+\1)+', '\1', 'gi')),
  last_name   = upper(regexp_replace(trim(last_name),   '(\S+)(\s+\1)+', '\1', 'gi'))
where role = 'student'
  and (
    first_name  is distinct from upper(regexp_replace(trim(first_name),  '(\S+)(\s+\1)+', '\1', 'gi'))
    or middle_name is distinct from upper(regexp_replace(trim(middle_name), '(\S+)(\s+\1)+', '\1', 'gi'))
    or last_name  is distinct from upper(regexp_replace(trim(last_name),  '(\S+)(\s+\1)+', '\1', 'gi'))
  );

-- 4. Verify — should return 0 rows.
select id, system_id, first_name, middle_name, last_name
  from public.profiles
 where role = 'student'
   and (
     first_name  is distinct from upper(regexp_replace(trim(first_name),  '(\S+)(\s+\1)+', '\1', 'gi'))
     or middle_name is distinct from upper(regexp_replace(trim(middle_name), '(\S+)(\s+\1)+', '\1', 'gi'))
     or last_name  is distinct from upper(regexp_replace(trim(last_name),  '(\S+)(\s+\1)+', '\1', 'gi'))
   );

-- To undo, from the backup table:
-- update public.profiles p
-- set first_name = b.first_name, middle_name = b.middle_name, last_name = b.last_name
-- from public.profiles_name_fix_backup b
-- where p.id = b.id;
