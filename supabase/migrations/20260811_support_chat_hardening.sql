-- STUDY TH — Support chat hardening
-- Run ONCE in Supabase SQL Editor after the existing support migrations.
-- Fixes: client thread creation, message inserts, attachments, realtime,
-- default support account, and safe idempotent policies.

create extension if not exists pgcrypto;

-- 1) Required support columns.
alter table public.support_messages
  add column if not exists attachment_url text,
  add column if not exists attachment_type text,
  add column if not exists attachment_name text,
  add column if not exists sticker text,
  add column if not exists sender_name text default '',
  add column if not exists account_id uuid references public.support_accounts(id),
  add column if not exists bot_handled boolean not null default false;

alter table public.support_threads
  add column if not exists account_id uuid references public.support_accounts(id),
  add column if not exists last_message text default '',
  add column if not exists unread_admin integer not null default 0,
  add column if not exists unread_user integer not null default 0,
  add column if not exists archived boolean not null default false;

-- 2) Guarantee the default support account exists.
insert into public.support_accounts (name, handle, avatar, description, bot_enabled, is_active)
values ('Hỗ trợ chung', 'support', '💬', 'Kênh hỗ trợ chính của STUDY TH', true, true)
on conflict (handle) do update
set is_active = true,
    bot_enabled = true;

update public.support_threads t
set account_id = a.id
from public.support_accounts a
where a.handle = 'support'
  and t.account_id is null;

update public.support_messages m
set account_id = t.account_id
from public.support_threads t
where t.id = m.thread_id
  and m.account_id is null;

-- 3) Permissions used by the current anon-key client architecture.
grant select, insert, update on public.support_accounts to anon, authenticated;
grant select, insert, update on public.support_threads to anon, authenticated;
grant select, insert, update on public.support_messages to anon, authenticated;

-- 4) Idempotent RLS policies. Existing project architecture intentionally
-- permits the public learner support widget to create/read its support data.
alter table public.support_accounts enable row level security;
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists support_accounts_read on public.support_accounts;
drop policy if exists support_accounts_write on public.support_accounts;
create policy support_accounts_read on public.support_accounts
for select to anon, authenticated using (is_active = true);
create policy support_accounts_write on public.support_accounts
for all to anon, authenticated using (true) with check (true);

drop policy if exists support_threads_select on public.support_threads;
drop policy if exists support_threads_insert on public.support_threads;
drop policy if exists support_threads_update on public.support_threads;
create policy support_threads_select on public.support_threads
for select to anon, authenticated using (true);
create policy support_threads_insert on public.support_threads
for insert to anon, authenticated with check (true);
create policy support_threads_update on public.support_threads
for update to anon, authenticated using (true) with check (true);

drop policy if exists support_messages_select on public.support_messages;
drop policy if exists support_messages_insert on public.support_messages;
drop policy if exists support_messages_update on public.support_messages;
create policy support_messages_select on public.support_messages
for select to anon, authenticated using (true);
create policy support_messages_insert on public.support_messages
for insert to anon, authenticated with check (true);
create policy support_messages_update on public.support_messages
for update to anon, authenticated using (true) with check (true);

-- 5) Realtime: add tables only when missing, so this migration is safe to rerun.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='support_threads'
  ) then
    alter publication supabase_realtime add table public.support_threads;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='support_accounts'
  ) then
    alter publication supabase_realtime add table public.support_accounts;
  end if;
end $$;

alter table public.support_threads replica identity full;
alter table public.support_messages replica identity full;

-- 6) Keep thread summary/unread counters correct for every new message.
create or replace function public.support_touch_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_threads
  set updated_at = coalesce(new.created_at, now()),
      last_message = left(
        coalesce(
          nullif(new.message,''),
          case
            when new.attachment_type like 'image/%' then '📷 Hình ảnh'
            when new.sticker is not null then coalesce(new.sticker,'✨ Sticker')
            else ''
          end
        ), 240
      ),
      unread_admin = case when new.sender='user' then coalesce(unread_admin,0)+1 else unread_admin end,
      unread_user = case when new.sender in ('admin','bot') then coalesce(unread_user,0)+1 else unread_user end
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists support_touch_thread_trigger on public.support_messages;
create trigger support_touch_thread_trigger
after insert on public.support_messages
for each row execute function public.support_touch_thread();

-- 7) Make sure the bot trigger remains compatible with the current schema.
create or replace function public.support_auto_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acc record;
  rule record;
  msg_lower text;
  waiting boolean := false;
begin
  if new.sender <> 'user' or coalesce(new.bot_handled,false) then
    return new;
  end if;

  select coalesce(t.bot_waiting_admin,false)
    into waiting
  from public.support_threads t
  where t.id = new.thread_id;
  if waiting then return new; end if;

  if length(trim(coalesce(new.message,''))) = 0 then return new; end if;

  select a.* into acc
  from public.support_accounts a
  join public.support_threads t on t.account_id=a.id
  where t.id=new.thread_id
    and a.is_active=true
    and a.bot_enabled=true
  limit 1;
  if not found then return new; end if;

  msg_lower := lower(coalesce(new.message,''));

  for rule in
    select * from public.support_bot_rules
    where account_id=acc.id and enabled=true
    order by priority desc, created_at asc
  loop
    if exists (
      select 1 from unnest(rule.keywords) k
      where msg_lower like '%' || lower(k) || '%'
    ) then
      insert into public.support_messages(
        thread_id, account_id, sender, sender_name, message, bot_handled
      ) values (
        new.thread_id, acc.id, 'bot', acc.name || ' • Bot', rule.reply, true
      );
      return new;
    end if;
  end loop;

  insert into public.support_messages(
    thread_id, account_id, sender, sender_name, message, bot_handled
  ) values (
    new.thread_id, acc.id, 'bot', acc.name || ' • Bot',
    'Mình đã nhận được tin nhắn của bạn 🤖. Admin sẽ phản hồi sớm nhất có thể.', true
  );

  return new;
end;
$$;

drop trigger if exists support_auto_reply_trigger on public.support_messages;
create trigger support_auto_reply_trigger
after insert on public.support_messages
for each row execute function public.support_auto_reply();

notify pgrst, 'reload schema';
