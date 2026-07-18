-- Run this in the Supabase SQL editor (or via the CLI) to create the table
-- that /api/lesson writes lesson submissions to.

create table if not exists public.lesson_records (
  id                  uuid primary key default gen_random_uuid(),
  school              text        not null,
  class_name          text        not null,
  lesson_date         date        not null,
  period              text        not null,
  status              text        not null,
  missed_reason       text        default '',
  missed_explanation  text        default '',
  learning_area       text        not null,
  specific_skill      text        not null,
  approach            text        not null,
  present             integer     not null default 0,
  absent              integer     not null default 0,
  computer_access     text        not null,
  overall_progress    text        not null,
  achievement         text        not null,
  challenges          text        not null,
  challenge_details   text        default '',
  support_required    text        default '',
  reference           text        default '',
  teacher             text        default '',
  created_at          timestamptz not null default now()
);

-- The API uses the service-role key, which bypasses Row Level Security.
-- RLS is enabled so that the anon/public key cannot read or write directly.
alter table public.lesson_records enable row level security;
