-- STUDY: persistent user history, wrong-answer review and support chat
-- Run this once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  device_id text unique not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_ip text,
  user_agent text
);

create table if not exists public.user_attempts (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  exam_id uuid,
  exam_title text not null,
  student_name text not null,
  student_code text,
  score integer not null default 0,
  correct integer not null default 0,
  total integer not null default 0,
  duration_seconds integer not null default 0,
  auto_submitted boolean not null default false,
  answers jsonb not null default '{}'::jsonb,
  wrong_indexes jsonb not null default '[]'::jsonb,
  reviewed_indexes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_attempts_device_idx on public.user_attempts(device_id, created_at desc);
create index if not exists user_attempts_exam_idx on public.user_attempts(exam_id, created_at desc);

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  device_id text unique not null,
  student_name text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  sender text not null check (sender in ('user','admin')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_thread_idx on public.support_messages(thread_id, created_at);

alter table public.user_devices enable row level security;
alter table public.user_attempts enable row level security;
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

-- The current site has no Supabase Auth/admin account yet, so these policies
-- allow the public quiz client to persist its anonymous device history and
-- support messages. The Admin page is UI-gated in the current app.
create policy if not exists user_devices_select on public.user_devices for select to anon, authenticated using (true);
create policy if not exists user_devices_insert on public.user_devices for insert to anon, authenticated with check (true);
create policy if not exists user_devices_update on public.user_devices for update to anon, authenticated using (true) with check (true);

create policy if not exists user_attempts_select on public.user_attempts for select to anon, authenticated using (true);
create policy if not exists user_attempts_insert on public.user_attempts for insert to anon, authenticated with check (true);
create policy if not exists user_attempts_update on public.user_attempts for update to anon, authenticated using (true) with check (true);

create policy if not exists support_threads_select on public.support_threads for select to anon, authenticated using (true);
create policy if not exists support_threads_insert on public.support_threads for insert to anon, authenticated with check (true);
create policy if not exists support_threads_update on public.support_threads for update to anon, authenticated using (true) with check (true);

create policy if not exists support_messages_select on public.support_messages for select to anon, authenticated using (true);
create policy if not exists support_messages_insert on public.support_messages for insert to anon, authenticated with check (true);

-- Helpful realtime updates for the chat panel.
alter publication supabase_realtime add table public.support_messages;
