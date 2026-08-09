-- STUDY TEST AI — Support media + history/admin access fix
-- Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- 1) Persisted history/participants must be readable by the browser client.
grant select, insert, update on public.user_attempts to anon, authenticated;
grant select, insert, update on public.participants to anon, authenticated;
grant select on public.exams to anon, authenticated;

drop policy if exists user_attempts_select on public.user_attempts;
drop policy if exists user_attempts_insert on public.user_attempts;
drop policy if exists user_attempts_update on public.user_attempts;
create policy user_attempts_select on public.user_attempts for select to anon, authenticated using (true);
create policy user_attempts_insert on public.user_attempts for insert to anon, authenticated with check (true);
create policy user_attempts_update on public.user_attempts for update to anon, authenticated using (true) with check (true);

drop policy if exists participants_select on public.participants;
drop policy if exists participants_insert on public.participants;
drop policy if exists participants_update on public.participants;
create policy participants_select on public.participants for select to anon, authenticated using (true);
create policy participants_insert on public.participants for insert to anon, authenticated with check (true);
create policy participants_update on public.participants for update to anon, authenticated using (true) with check (true);

drop policy if exists exams_select on public.exams;
create policy exams_select on public.exams for select to anon, authenticated using (status = 'active');

-- 2) Older support migration only allowed user/admin. Bot/system are now valid senders.
drop constraint if exists support_messages_sender_check on public.support_messages;
alter table public.support_messages drop constraint if exists support_messages_sender_check;
alter table public.support_messages add constraint support_messages_sender_check check (sender in ('user','admin','bot','system'));

-- 3) Message attachments. A message can contain text, an image/GIF, or a sticker.
alter table public.support_messages add column if not exists attachment_url text;
alter table public.support_messages add column if not exists attachment_type text;
alter table public.support_messages add column if not exists attachment_name text;
alter table public.support_messages add column if not exists sticker text;

-- 4) Public Supabase Storage bucket for support images/GIFs.
insert into storage.buckets (id, name, public)
values ('support-media', 'support-media', true)
on conflict (id) do update set public = true;

drop policy if exists support_media_read on storage.objects;
drop policy if exists support_media_insert on storage.objects;
create policy support_media_read
on storage.objects for select to anon, authenticated
using (bucket_id = 'support-media');
create policy support_media_insert
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'support-media');

-- 5) Realtime for support messages/threads/media metadata.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_messages') then
    alter publication supabase_realtime add table public.support_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_threads') then
    alter publication supabase_realtime add table public.support_threads;
  end if;
end $$;

alter table public.support_messages replica identity full;
alter table public.support_threads replica identity full;

-- 6) Keep thread summaries and unread counters correct for bot/admin/user messages.
create or replace function public.support_touch_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_threads
  set updated_at = coalesce(new.created_at, now()),
      last_message = left(coalesce(nullif(new.message,''), case when new.attachment_type like 'image/%' then '📷 Hình ảnh' when new.attachment_type='sticker' then coalesce(new.sticker,'✨ Sticker') else '' end), 240),
      unread_admin = case when new.sender = 'user' then coalesce(unread_admin,0) + 1 else unread_admin end,
      unread_user = case when new.sender in ('admin','bot') then coalesce(unread_user,0) + 1 else unread_user end
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists support_touch_thread_trigger on public.support_messages;
create trigger support_touch_thread_trigger
after insert on public.support_messages
for each row execute function public.support_touch_thread();

-- 7) Make existing active exams safe for the public client after the policy above.
update public.exams set status='active' where status is null;

-- NOTE: exam deletion is performed through the authenticated Admin API, not by granting
-- anonymous DELETE on exams. This keeps the destructive action behind the admin session.
