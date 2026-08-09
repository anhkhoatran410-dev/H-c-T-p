-- STUDY: fix support chat permissions and make the inbox work independently
-- Run this once in Supabase SQL Editor.

-- Browser clients use the anon role, so the Data API must have table grants in
-- addition to RLS policies.
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
