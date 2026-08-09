-- STUDY TEST AI — Support chat sender constraint fix
-- Run once in Supabase SQL Editor.
-- Support 2.0 stores automatic replies with sender='bot',
-- while the original schema only allowed 'user' and 'admin'.

alter table public.support_messages
  drop constraint if exists support_messages_sender_check;

alter table public.support_messages
  add constraint support_messages_sender_check
  check (sender in ('user', 'admin', 'bot', 'system'));

-- Keep Support 2.0 columns available on older databases.
alter table public.support_messages
  add column if not exists account_id uuid references public.support_accounts(id);
alter table public.support_messages
  add column if not exists sender_name text default '';
alter table public.support_messages
  add column if not exists bot_handled boolean not null default false;

alter table public.support_messages replica identity full;

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
