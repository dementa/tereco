-- Run after 10-attendance.sql.
--
-- Lifts the original "exactly one super_admin, locked to one fixed email"
-- restriction. Super-admin creation is now gated at the app layer (only an
-- existing super admin can create another, via the account-creation API),
-- so the DB-level cap and identity trigger are no longer needed and would
-- block adding a second super admin.
drop index if exists public.one_super_admin_idx;
drop trigger if exists trg_enforce_super_admin_identity on public.profiles;
drop function if exists public.enforce_super_admin_identity();
