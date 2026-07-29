-- Run after 15-widen-session-range.sql.
--
-- Adds the school_admin role: one login per school (its own system_id
-- doubles as the login id — see lib/entities/accounts.ts createSchoolAdminLogin),
-- scoped to that school's own classes/streams/staff/students plus read-only
-- attendance/assessment oversight. profiles_school_scope_ck needs no change:
-- it only forces school_id null for super_admin/admin/student, and
-- school_admin falls through its `else true` branch same as staff/parent.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin','admin','staff','student','parent','school_admin'));
