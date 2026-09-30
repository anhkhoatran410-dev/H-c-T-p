-- STUDY TH — Exam + Flashcard hardening
-- Run once in Supabase SQL Editor.
-- Fixes: missing exams.flashcard_only column, PostgREST schema cache,
-- and safe defaults for the Flashcard-only learning mode.

alter table public.exams
  add column if not exists flashcard_only boolean not null default false;

update public.exams
set flashcard_only = coalesce(flashcard_only, false)
where flashcard_only is null;

create index if not exists exams_flashcard_only_created_idx
  on public.exams(flashcard_only, created_at desc);

grant select, insert, update on public.exams to anon, authenticated;

-- Keep the existing public read policy if present; add an insert policy only
-- when RLS is enabled and the policy is missing.
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='exams' and c.relrowsecurity=true
  ) then
    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='exams' and policyname='exams_insert_public'
    ) then
      execute 'create policy exams_insert_public on public.exams for insert to anon, authenticated with check (true)';
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';


-- Admin account directory: read Auth users and profile metadata in one server-side call.
create or replace function public.admin_list_user_accounts()
returns table(
  id uuid,
  email text,
  full_name text,
  student_code text,
  role text,
  status text,
  email_confirmed boolean,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.id,
    coalesce(u.email,'')::text,
    coalesce(p.full_name, u.raw_user_meta_data->>'full_name', '')::text,
    coalesce(p.student_code, u.raw_user_meta_data->>'student_code', '')::text,
    coalesce(p.role, u.raw_app_meta_data->>'role', 'student')::text,
    coalesce(p.status, 'active')::text,
    (u.email_confirmed_at is not null),
    u.last_sign_in_at,
    u.created_at,
    coalesce(p.updated_at, u.updated_at)
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by u.created_at desc;
$$;

revoke all on function public.admin_list_user_accounts() from public, anon, authenticated;
grant execute on function public.admin_list_user_accounts() to service_role;
