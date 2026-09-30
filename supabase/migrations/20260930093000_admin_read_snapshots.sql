-- Admin read snapshots for projects where the server-side Supabase service key is
-- not present in the Vercel production environment.
-- Only sanitized columns are exposed; raw answers and device IDs stay private.

create or replace view public.admin_attempts_snapshot
with (security_barrier=true)
as
select
  ua.id,
  ua.created_at,
  ua.student_name,
  ua.student_code,
  ua.exam_title,
  ua.score,
  ua.correct,
  ua.total,
  case
    when jsonb_typeof(ua.wrong_indexes) = 'array' then jsonb_array_length(ua.wrong_indexes)
    else 0
  end as wrong_count
from public.user_attempts ua;

create or replace view public.admin_participants_snapshot
with (security_barrier=true)
as
select
  p.id,
  p.name,
  p.code,
  p.created_at,
  count(ua.id)::integer as attempts_count,
  max(ua.created_at) as latest_activity,
  max(ua.score) filter (
    where ua.created_at = (
      select max(ua2.created_at)
      from public.user_attempts ua2
      where coalesce(nullif(ua2.student_code,''), nullif(ua2.device_id,'')) = p.code
    )
  ) as latest_score
from public.participants p
left join public.user_attempts ua
  on coalesce(nullif(ua.student_code,''), nullif(ua.device_id,'')) = p.code
group by p.id,p.name,p.code,p.created_at;

create or replace view public.admin_student_accounts_snapshot
with (security_barrier=true)
as
select
  p.id,
  p.full_name,
  p.student_code,
  p.role,
  p.status,
  p.created_at,
  p.updated_at,
  case
    when position('@' in coalesce(p.email,'')) > 1
      then left(p.email,1) || '***' || substring(p.email from position('@' in p.email))
    else p.email
  end as email_masked
from public.profiles p
where p.role='student';

revoke all on public.admin_attempts_snapshot from public, anon, authenticated;
revoke all on public.admin_participants_snapshot from public, anon, authenticated;
revoke all on public.admin_student_accounts_snapshot from public, anon, authenticated;

grant select on public.admin_attempts_snapshot to anon, authenticated;
grant select on public.admin_participants_snapshot to anon, authenticated;
grant select on public.admin_student_accounts_snapshot to anon, authenticated;

notify pgrst, 'reload schema';
