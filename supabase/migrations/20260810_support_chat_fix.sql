-- STUDY: support chat permissions + realtime delivery
-- Run this once in Supabase SQL Editor.

grant select, insert, update on public.support_threads to anon, authenticated;
grant select, insert on public.support_messages to anon, authenticated;

drop policy if exists support_threads_select on public.support_threads;
drop policy if exists support_threads_insert on public.support_threads;
drop policy if exists support_threads_update on public.support_threads;
drop policy if exists support_messages_select on public.support_messages;
drop policy if exists support_messages_insert on public.support_messages;

create policy support_threads_select
on public.support_threads
for select to anon, authenticated
using (true);

create policy support_threads_insert
on public.support_threads
for insert to anon, authenticated
with check (true);

create policy support_threads_update
on public.support_threads
for update to anon, authenticated
using (true)
with check (true);

create policy support_messages_select
on public.support_messages
for select to anon, authenticated
using (true);

create policy support_messages_insert
on public.support_messages
for insert to anon, authenticated
with check (true);

-- Realtime needs the tables in the Supabase Realtime publication.
-- The DO blocks make this safe to run even when a table is already present.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_threads'
  ) then
    alter publication supabase_realtime add table public.support_threads;
  end if;
end $$;

alter table public.support_messages replica identity full;
alter table public.support_threads replica identity full;
