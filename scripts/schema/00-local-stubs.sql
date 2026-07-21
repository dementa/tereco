-- Local-only stand-in for the objects Supabase manages for us.
--
-- NOT part of the real schema and never run against Supabase — it exists so
-- 01-core.sql and 02-audit.sql can be applied to a plain Postgres for type
-- generation and constraint testing. Supabase already provides all of this.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema if not exists auth;

-- Only the columns public.profiles actually references.
create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

create or replace function auth.uid() returns uuid
  language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text
  language sql stable as $$ select null::text $$;
