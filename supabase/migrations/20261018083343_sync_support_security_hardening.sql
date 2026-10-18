-- STUDY TH — security hardening + safe support bootstrap.
-- Idempotent: the bootstrap inserts only when no active support channel exists.

insert into public.support_accounts (name, handle, avatar, description, bot_enabled, is_active)
select 'Hỗ trợ STUDY', 'support', '💬',
       'Hỏi admin về bài kiểm tra, tài khoản, lỗi hệ thống', true, true
where not exists (
  select 1 from public.support_accounts where is_active = true
);

-- Admin snapshots must be readable by server-side service_role only.
-- The live project had anon/authenticated SELECT grants but no service_role SELECT.
grant select on public.admin_attempts_snapshot,
                public.admin_participants_snapshot,
                public.admin_student_accounts_snapshot
to service_role;

revoke all on public.admin_attempts_snapshot
  from public, anon, authenticated;
revoke all on public.admin_participants_snapshot
  from public, anon, authenticated;
revoke all on public.admin_student_accounts_snapshot
  from public, anon, authenticated;

-- PostgREST client roles do not need elevated table privileges.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format(
      'revoke truncate, references, trigger on public.%I from anon, authenticated',
      t
    );
  end loop;
end $$;

-- Internal trigger functions should not be callable through /rest/v1/rpc.
revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;
revoke execute on function public.support_auto_reply()
  from public, anon, authenticated;
revoke execute on function public.support_touch_thread()
  from public, anon, authenticated;
