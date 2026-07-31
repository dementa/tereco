-- Run after 18-library-pdf-pages.sql.
--
-- Deleting Library content is a soft-delete (archived_at, mirroring how
-- assessments use deleted_at) so an admin/super_admin's DELETE action can be
-- undone in principle and never orphans library_content_targets/
-- library_feedback via cascade. library_content_for_profile (17-library.sql)
-- predates archived_at existing as a real feature (it was an unused column
-- until now) and needs the same "archived_at is null" guard every other
-- Library read path already has (lib/entities/library-content.ts), or a
-- deleted item would keep showing up in every browse/RPC-backed list.
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
      select c.* from public.library_content c
       where c.status = 'approved' and c.archived_at is null;

  elsif v_role in ('staff','school_admin') then
    return query
      select c.* from public.library_content c
       where c.status = 'approved' and c.archived_at is null
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
       where c.status = 'approved' and c.archived_at is null
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
       where c.status = 'approved' and c.archived_at is null
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

notify pgrst, 'reload schema';
