-- P0: move attempt data access behind server-side signed sessions.
-- Keep RLS enabled and remove all public client privileges.
drop policy if exists "participants_select" on public.participants;
drop policy if exists "participants_insert" on public.participants;
drop policy if exists "participants_update" on public.participants;
drop policy if exists "user_attempts_select" on public.user_attempts;
drop policy if exists "user_attempts_insert" on public.user_attempts;
drop policy if exists "user_attempts_update" on public.user_attempts;

revoke all privileges on table public.participants from anon, authenticated, public;
revoke all privileges on table public.user_attempts from anon, authenticated, public;

grant select, insert, update on table public.participants to service_role;
grant select, insert, update on table public.user_attempts to service_role;

create or replace function public.sync_participant_from_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  participant_code text;
begin
  participant_code := nullif(btrim(new.student_code), '');
  if participant_code is null then
    return new;
  end if;

  insert into public.participants(name, code)
  values (coalesce(nullif(btrim(new.student_name), ''), 'Người học'), participant_code)
  on conflict (code) do nothing;

  return new;
end;
$$;

revoke execute on function public.sync_participant_from_attempt() from public, anon, authenticated;
grant execute on function public.sync_participant_from_attempt() to service_role;
