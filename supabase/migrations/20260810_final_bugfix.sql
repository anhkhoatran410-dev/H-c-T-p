-- STUDY TH final bugfix migration
-- Run once in Supabase SQL Editor AFTER the existing support migrations.
-- This file is idempotent and fixes the server-side state that the browser alone cannot fix.

-- 1) Bot: answer once, then wait for Admin. Admin reply resets the gate.
alter table public.support_threads
  add column if not exists bot_waiting_admin boolean not null default false;

create index if not exists support_threads_bot_waiting_idx
  on public.support_threads(bot_waiting_admin, updated_at desc);

create or replace function public.support_touch_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_threads
  set updated_at = coalesce(new.created_at, now()),
      last_message = left(coalesce(nullif(new.message,''),
        case
          when new.attachment_type like 'image/%' then '📷 Hình ảnh'
          when new.sticker is not null then coalesce(new.sticker,'✨ Sticker')
          else ''
        end), 240),
      unread_admin = case when new.sender = 'user' then coalesce(unread_admin,0) + 1 else unread_admin end,
      unread_user = case when new.sender in ('admin','bot') then coalesce(unread_user,0) + 1 else unread_user end,
      bot_waiting_admin = case
        when new.sender = 'bot' then true
        when new.sender = 'admin' then false
        else bot_waiting_admin
      end
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists support_touch_thread_trigger on public.support_messages;
create trigger support_touch_thread_trigger
after insert on public.support_messages
for each row execute function public.support_touch_thread();

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

  select coalesce(t.bot_waiting_admin,false) into waiting
  from public.support_threads t where t.id = new.thread_id;
  if waiting then return new; end if;

  -- Media/sticker-only messages do not need a bot paragraph.
  if length(trim(coalesce(new.message,''))) = 0 then return new; end if;

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
    if exists (select 1 from unnest(rule.keywords) k where msg_lower like '%' || lower(k) || '%') then
      insert into public.support_messages(thread_id,account_id,sender,sender_name,message,bot_handled)
      values(new.thread_id,acc.id,'bot',acc.name || ' • Bot',rule.reply,true);
      return new;
    end if;
  end loop;

  insert into public.support_messages(thread_id,account_id,sender,sender_name,message,bot_handled)
  values(new.thread_id,acc.id,'bot',acc.name || ' • Bot','Mình đã nhận được tin nhắn của bạn 🤖. Admin sẽ phản hồi sớm nhất có thể.',true);
  return new;
end;
$$;

drop trigger if exists support_auto_reply_trigger on public.support_messages;
create trigger support_auto_reply_trigger
after insert on public.support_messages
for each row execute function public.support_auto_reply();

-- Existing conversations that already received a bot reply stay paused.
update public.support_threads t
set bot_waiting_admin = true
where exists (select 1 from public.support_messages m where m.thread_id=t.id and m.sender='bot');

-- 2) Participants: derive them from attempts too, and make code safe for upsert.
-- Remove duplicate participant codes first so the unique index cannot fail.
delete from public.participants p
where p.code is not null
  and exists (
    select 1 from public.participants newer
    where newer.code = p.code
      and newer.ctid > p.ctid
  );

create unique index if not exists participants_code_unique_idx
  on public.participants(code)
  where code is not null;

create or replace function public.sync_participant_from_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  participant_code text;
begin
  participant_code := coalesce(nullif(new.student_code,''), nullif(new.device_id,''));
  if participant_code is null then return new; end if;
  insert into public.participants(name,code)
  values(coalesce(nullif(new.student_name,''),'Người học'),participant_code)
  on conflict (code) do update set name=excluded.name;
  return new;
end;
$$;

drop trigger if exists sync_participant_from_attempt_trigger on public.user_attempts;
create trigger sync_participant_from_attempt_trigger
after insert on public.user_attempts
for each row execute function public.sync_participant_from_attempt();

-- Backfill participants from all existing attempts.
insert into public.participants(name,code)
select coalesce(nullif(a.student_name,''),'Người học'), coalesce(nullif(a.student_code,''),nullif(a.device_id,''))
from public.user_attempts a
where coalesce(nullif(a.student_code,''),nullif(a.device_id,'')) is not null
on conflict (code) do update set name=excluded.name;

-- 3) Keep public learner pages able to read saved exams/attempts.
grant select on public.exams to anon, authenticated;
grant select,insert,update on public.user_attempts to anon, authenticated;
grant select,insert,update on public.participants to anon, authenticated;

-- Refresh PostgREST after the schema/trigger changes.
notify pgrst, 'reload schema';
