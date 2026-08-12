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
