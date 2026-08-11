-- STUDY TH — FINAL support runtime guardrails
-- Idempotent. Run once in Supabase SQL Editor after the existing support migrations.

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

insert into public.support_accounts(name,handle,avatar,description,bot_enabled,is_active)
values('Hỗ trợ chung','support','💬','Kênh hỗ trợ chính của STUDY TH',true,true)
on conflict(handle) do update set is_active=true;

alter table public.support_threads add column if not exists account_id uuid references public.support_accounts(id);
alter table public.support_threads add column if not exists student_name text;
alter table public.support_threads add column if not exists last_message text default '';
alter table public.support_threads add column if not exists unread_admin integer not null default 0;
alter table public.support_threads add column if not exists unread_user integer not null default 0;
alter table public.support_threads add column if not exists bot_waiting_admin boolean not null default false;

alter table public.support_messages add column if not exists account_id uuid references public.support_accounts(id);
alter table public.support_messages add column if not exists sender_name text default '';
alter table public.support_messages add column if not exists bot_handled boolean not null default false;
alter table public.support_messages add column if not exists attachment_url text;
alter table public.support_messages add column if not exists attachment_type text;
alter table public.support_messages add column if not exists attachment_name text;
alter table public.support_messages add column if not exists sticker text;

update public.support_threads
set account_id=(select id from public.support_accounts where handle='support' limit 1)
where account_id is null;

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_accounts enable row level security;

grant select,insert,update on public.support_accounts to anon,authenticated;
grant select,insert,update on public.support_threads to anon,authenticated;
grant select,insert on public.support_messages to anon,authenticated;

drop policy if exists support_runtime_accounts_select on public.support_accounts;
drop policy if exists support_runtime_accounts_update on public.support_accounts;
drop policy if exists support_runtime_threads_select on public.support_threads;
drop policy if exists support_runtime_threads_insert on public.support_threads;
drop policy if exists support_runtime_threads_update on public.support_threads;
drop policy if exists support_runtime_messages_select on public.support_messages;
drop policy if exists support_runtime_messages_insert on public.support_messages;

create policy support_runtime_accounts_select on public.support_accounts for select to anon,authenticated using (is_active=true);
create policy support_runtime_accounts_update on public.support_accounts for update to anon,authenticated using (true) with check (true);
create policy support_runtime_threads_select on public.support_threads for select to anon,authenticated using (true);
create policy support_runtime_threads_insert on public.support_threads for insert to anon,authenticated with check (true);
create policy support_runtime_threads_update on public.support_threads for update to anon,authenticated using (true) with check (true);
create policy support_runtime_messages_select on public.support_messages for select to anon,authenticated using (true);
create policy support_runtime_messages_insert on public.support_messages for insert to anon,authenticated with check (true);

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_messages') then alter publication supabase_realtime add table public.support_messages; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_threads') then alter publication supabase_realtime add table public.support_threads; end if;
end $$;

alter table public.support_messages replica identity full;
alter table public.support_threads replica identity full;
notify pgrst,'reload schema';
