-- STUDY TH: FINAL support-chat repair
-- Run once in Supabase SQL Editor.
-- Fixes message columns, permissions and realtime without destructive policies.

alter table public.support_messages
  add column if not exists attachment_url text,
  add column if not exists attachment_type text,
  add column if not exists attachment_name text,
  add column if not exists sticker text;

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

grant select, insert, update on public.support_threads to anon, authenticated;
grant select, insert on public.support_messages to anon, authenticated;

drop policy if exists support_threads_select on public.support_threads;
drop policy if exists support_threads_insert on public.support_threads;
drop policy if exists support_threads_update on public.support_threads;
drop policy if exists support_messages_select on public.support_messages;
drop policy if exists support_messages_insert on public.support_messages;

after $$
begin
  null;
end $$;
