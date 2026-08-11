-- STUDY TH: FINAL support-chat repair
-- Run once in Supabase SQL Editor.
-- Safe/idempotent: restores media columns, RLS policies and realtime.

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

create policy support_threads_select
on public.support_threads for select to anon, authenticated
using (true);

create policy support_threads_insert
on public.support_threads for insert to anon, authenticated
with check (true);

create policy support_threads_update
on public.support_threads for update to anon, authenticated
using (true) with check (true);

create policy support_messages_select
on public.support_messages for select to anon, authenticated
using (true);

create policy support_messages_insert
on public.support_messages for insert to anon, authenticated
with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='support_threads'
  ) then
    alter publication supabase_realtime add table public.support_threads;
  end if;
end $$;

alter table public.support_messages replica identity full;
alter table public.support_threads replica identity full;

notify pgrst, 'reload schema';
