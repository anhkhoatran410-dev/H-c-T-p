-- STUDY TEST AI — Support 2.0
-- Run once in Supabase SQL Editor after the existing support-chat migration.

create extension if not exists pgcrypto;

create table if not exists public.support_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  handle text unique,
  avatar text default '💬',
  description text default '',
  bot_enabled boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_bot_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.support_accounts(id) on delete cascade,
  keywords text[] not null default '{}',
  reply text not null,
  priority integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('user','assistant','system')),
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.support_threads add column if not exists account_id uuid references public.support_accounts(id);
alter table public.support_threads add column if not exists last_message text default '';
alter table public.support_threads add column if not exists unread_admin integer not null default 0;
alter table public.support_threads add column if not exists unread_user integer not null default 0;
alter table public.support_threads add column if not exists archived boolean not null default false;

alter table public.support_messages add column if not exists account_id uuid references public.support_accounts(id);
alter table public.support_messages add column if not exists sender_name text default '';
alter table public.support_messages add column if not exists bot_handled boolean not null default false;

insert into public.support_accounts (name, handle, avatar, description, bot_enabled)
values
  ('Hỗ trợ chung', 'support', '💬', 'Kênh hỗ trợ chính của STUDY TEST AI', true),
  ('Kỹ thuật', 'tech', '🛠️', 'Lỗi website, đăng nhập, bài kiểm tra và dữ liệu', true),
  ('Học tập', 'study', '🎓', 'Hướng dẫn sử dụng và hỗ trợ làm bài', true)
on conflict (handle) do nothing;

-- Backfill existing conversations into the default support account.
update public.support_threads
set account_id = (select id from public.support_accounts where handle = 'support' limit 1)
where account_id is null;

update public.support_messages m
set account_id = t.account_id
from public.support_threads t
where t.id = m.thread_id and m.account_id is null;

create index if not exists support_threads_account_updated_idx on public.support_threads(account_id, updated_at desc);
create index if not exists support_messages_thread_created_idx on public.support_messages(thread_id, created_at asc);
create index if not exists support_bot_rules_account_priority_idx on public.support_bot_rules(account_id, priority desc);

-- Default automatic replies. They can be edited/disabled from Admin.
insert into public.support_bot_rules(account_id, keywords, reply, priority)
select a.id, x.keywords, x.reply, x.priority
from public.support_accounts a
cross join (values
  (array['xin chào','hello','hi','chào'], 'Chào bạn 👋 Mình đã nhận được tin nhắn. Bạn mô tả vấn đề giúp mình nhé, Admin sẽ xem ngay khi online.', 20),
  (array['không load','khong load','loading','đứng','đơ','treo'], 'Mình đã ghi nhận lỗi tải trang. Bạn gửi giúp mình ảnh màn hình lỗi nếu có nhé. Admin sẽ kiểm tra.', 30),
  (array['lỗi','loi','error','không vào được','khong vao duoc'], 'Mình đã nhận thông tin lỗi. Bạn có thể gửi thêm ảnh Console/F12 hoặc mô tả bước gây lỗi để Admin xử lý nhanh hơn.', 25),
  (array['điểm','diem','lịch sử','lich su'], 'Bạn đang hỏi về điểm/lịch sử làm bài. Mình đã ghi nhận, Admin sẽ kiểm tra dữ liệu tài khoản của bạn.', 15)
) as x(keywords, reply, priority)
where a.handle = 'support'
  and not exists (select 1 from public.support_bot_rules r where r.account_id = a.id and r.reply = x.reply);

-- Keep thread summaries current.
create or replace function public.support_touch_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_threads
  set updated_at = coalesce(new.created_at, now()),
      last_message = left(coalesce(new.message, ''), 240),
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

-- Automatic bot response. This is database-side so it does not depend on a browser staying open.
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
  matched boolean := false;
begin
  if new.sender <> 'user' or coalesce(new.bot_handled,false) then
    return new;
  end if;

  select a.* into acc
  from public.support_accounts a
  join public.support_threads t on t.account_id = a.id
  where t.id = new.thread_id
    and a.is_active = true
    and a.bot_enabled = true
  limit 1;

  if not found then return new; end if;

  msg_lower := lower(coalesce(new.message,''));

  for rule in
    select * from public.support_bot_rules
    where account_id = acc.id and enabled = true
    order by priority desc, created_at asc
  loop
    if exists (
      select 1 from unnest(rule.keywords) k
      where msg_lower like '%' || lower(k) || '%'
    ) then
      insert into public.support_messages(thread_id, account_id, sender, sender_name, message, bot_handled)
      values (new.thread_id, acc.id, 'bot', acc.name || ' • Bot', rule.reply, true);
      matched := true;
      exit;
    end if;
  end loop;

  if not matched and length(msg_lower) > 0 then
    insert into public.support_messages(thread_id, account_id, sender, sender_name, message, bot_handled)
    values (new.thread_id, acc.id, 'bot', acc.name || ' • Bot', 'Mình đã nhận được tin nhắn của bạn 🤖. Admin sẽ phản hồi sớm nhất có thể.', true);
  end if;

  return new;
end;
$$;

drop trigger if exists support_auto_reply_trigger on public.support_messages;
create trigger support_auto_reply_trigger
after insert on public.support_messages
for each row execute function public.support_auto_reply();

-- Realtime publication for instant chat updates.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_messages') then
    alter publication supabase_realtime add table public.support_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_threads') then
    alter publication supabase_realtime add table public.support_threads;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_accounts') then
    alter publication supabase_realtime add table public.support_accounts;
  end if;
end $$;

alter table public.support_messages replica identity full;
alter table public.support_threads replica identity full;

-- Basic policies for the current anon-key architecture.
grant select, insert, update on public.support_accounts to anon, authenticated;
grant select, insert, update on public.support_bot_rules to anon, authenticated;
grant select, insert on public.admin_assistant_messages to anon, authenticated;

drop policy if exists support_accounts_read on public.support_accounts;
drop policy if exists support_accounts_write on public.support_accounts;
drop policy if exists support_bot_rules_read on public.support_bot_rules;
drop policy if exists support_bot_rules_write on public.support_bot_rules;
drop policy if exists admin_assistant_messages_read on public.admin_assistant_messages;
drop policy if exists admin_assistant_messages_write on public.admin_assistant_messages;

create policy support_accounts_read on public.support_accounts for select to anon, authenticated using (is_active = true);
create policy support_accounts_write on public.support_accounts for all to anon, authenticated using (true) with check (true);
create policy support_bot_rules_read on public.support_bot_rules for select to anon, authenticated using (enabled = true);
create policy support_bot_rules_write on public.support_bot_rules for all to anon, authenticated using (true) with check (true);
create policy admin_assistant_messages_read on public.admin_assistant_messages for select to anon, authenticated using (true);
create policy admin_assistant_messages_write on public.admin_assistant_messages for insert to anon, authenticated with check (true);
