-- TERECO audit log. Run after 01-core.sql.
--
-- Every write performed through the super admin console lands here. This is
-- the "audits" half of the super admin dashboard.

-- ─── Audit log ──────────────────────────────────────────────────────────────
-- actor_email/actor_name are deliberately DENORMALISED snapshots, not joins.
-- An audit trail that loses the actor's identity when their profile is deleted
-- is not an audit trail — the FK goes null, the snapshot survives.
create table public.audit_log (
  id           bigserial primary key,
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_email  text not null default '',
  actor_name   text not null default '',
  actor_role   text not null default '',
  action       text not null check (action in (
                 'create','update','delete','restore',
                 'login','login_failed','logout',
                 'password_change','password_reset','import'
               )),
  entity_type  text not null default '',   -- 'schools', 'profiles', 'enrollments', ...
  entity_id    text,                       -- uuid or system_id, as text
  entity_label text not null default '',   -- human-readable at time of action
  before       jsonb,
  after        jsonb,
  summary      text not null default '',
  ip_address   text,
  user_agent   text,
  created_at   timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx  on public.audit_log (entity_type, entity_id);
create index audit_log_actor_idx   on public.audit_log (actor_id, created_at desc);
create index audit_log_action_idx  on public.audit_log (action, created_at desc);
alter table public.audit_log enable row level security;

-- The log is append-only. Even the service-role key must not be able to
-- rewrite history through the app — revoked below, and enforced by trigger so
-- a stray UPDATE/DELETE fails loudly instead of silently succeeding.
create or replace function public.audit_log_is_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only; % is not permitted', tg_op;
end;
$$;
create trigger trg_audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();

grant select, insert on public.audit_log to service_role;
grant usage, select on sequence public.audit_log_id_seq to service_role;
