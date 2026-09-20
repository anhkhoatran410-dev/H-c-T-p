-- Keep production DB schema in sync with the Deep job status RPC used by the Vercel status endpoint.
create or replace function public.ai_solver_get_job(p_job_id uuid)
returns table(
  id uuid,
  status text,
  tier text,
  stage text,
  stage_detail jsonb,
  error text,
  result jsonb,
  attempts integer,
  max_attempts integer,
  created_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path=public
as $$
  select j.id,j.status,j.tier,j.stage,j.stage_detail,j.error,j.result,
         j.attempts,j.max_attempts,j.created_at,j.started_at,j.finished_at,j.updated_at
  from public.ai_solver_jobs j
  where j.id=p_job_id
  limit 1;
$$;
revoke all on function public.ai_solver_get_job(uuid) from public,anon,authenticated;
grant execute on function public.ai_solver_get_job(uuid) to service_role;
