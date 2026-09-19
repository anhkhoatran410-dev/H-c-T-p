
create extension if not exists pgmq;

create table if not exists public.ai_solver_jobs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  tier text not null check (tier in ('deep','hard','standard','fast')),
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  payload jsonb not null,
  result jsonb,
  error text,
  stage text,
  stage_detail jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 2,
  worker_id text,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists ai_solver_jobs_status_idx on public.ai_solver_jobs(status, created_at);
create index if not exists ai_solver_jobs_lease_idx on public.ai_solver_jobs(status, lease_until);
create index if not exists ai_solver_jobs_updated_idx on public.ai_solver_jobs(updated_at desc);
alter table public.ai_solver_jobs enable row level security;

select pgmq.create('study_ai_deep');

create or replace function public.ai_solver_create_job(
  p_idempotency_key text, p_tier text, p_payload jsonb, p_max_attempts integer default 2
) returns table(job_id uuid, status text, reused boolean)
language plpgsql security definer
set search_path=public,extensions,pgmq
as $$
declare v_id uuid; v_status text;
begin
  select id, ai_solver_jobs.status into v_id,v_status from public.ai_solver_jobs
  where idempotency_key=p_idempotency_key for update;
  if found then return query select v_id,v_status,true; return; end if;
  insert into public.ai_solver_jobs(idempotency_key,tier,payload,max_attempts)
  values(p_idempotency_key,case when p_tier in ('deep','hard','standard','fast') then p_tier else 'deep' end,
         coalesce(p_payload,'{}'::jsonb),greatest(1,least(5,coalesce(p_max_attempts,2))))
  returning id into v_id;
  perform pgmq.send('study_ai_deep',jsonb_build_object('job_id',v_id::text));
  return query select v_id,'queued'::text,false;
end;
$$;

create or replace function public.ai_solver_claim_job(
  p_job_id uuid,p_worker_id text,p_lease_seconds integer default 120,p_max_concurrency integer default 1
) returns table(claimed boolean, attempts integer, payload jsonb)
language plpgsql security definer
set search_path=public
as $$
declare active_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('study-ai-deep-concurrency')::bigint);
  select count(*) into active_count from public.ai_solver_jobs where status='running' and lease_until is not null and lease_until>=now();
  if active_count >= greatest(1,least(20,coalesce(p_max_concurrency,1))) then
    return;
  end if;
  return query
  update public.ai_solver_jobs
  set status='running',worker_id=left(coalesce(p_worker_id,'worker'),120),
      lease_until=now()+make_interval(secs=>greatest(15,least(600,coalesce(p_lease_seconds,120)))),
      started_at=coalesce(started_at,now()),attempts=attempts+1,updated_at=now()
  where id=p_job_id and (status='queued' or (status='running' and lease_until is not null and lease_until<now()))
  returning true,attempts,payload;
end;
$$;

create or replace function public.ai_solver_renew_job(
  p_job_id uuid,p_worker_id text,p_lease_seconds integer default 120
) returns boolean
language sql security definer set search_path=public
as $$
 update public.ai_solver_jobs
 set lease_until=now()+make_interval(secs=>greatest(15,least(600,coalesce(p_lease_seconds,120)))),updated_at=now()
 where id=p_job_id and status='running' and worker_id=left(coalesce(p_worker_id,'worker'),120)
 returning true;
$$;

create or replace function public.ai_solver_update_stage(
  p_job_id uuid,p_worker_id text,p_stage text,p_detail jsonb default '{}'::jsonb
) returns boolean
language sql security definer set search_path=public
as $$
 update public.ai_solver_jobs
 set stage=left(coalesce(p_stage,''),80),stage_detail=coalesce(p_detail,'{}'::jsonb),updated_at=now()
 where id=p_job_id and status='running' and worker_id=left(coalesce(p_worker_id,'worker'),120)
 returning true;
$$;

create or replace function public.ai_solver_complete_job(
  p_job_id uuid,p_worker_id text,p_result jsonb
) returns boolean
language sql security definer set search_path=public
as $$
 update public.ai_solver_jobs
 set status='done',result=coalesce(p_result,'{}'::jsonb),error=null,lease_until=null,finished_at=now(),updated_at=now()
 where id=p_job_id and status in ('running','queued')
   and (worker_id=left(coalesce(p_worker_id,'worker'),120) or worker_id is null)
 returning true;
$$;

create or replace function public.ai_solver_fail_job(
  p_job_id uuid,p_worker_id text,p_error text,p_retryable boolean default true
) returns table(requeued boolean, attempts integer, max_attempts integer)
language plpgsql security definer
set search_path=public,extensions,pgmq
as $$
declare v_attempts integer;v_max integer;
begin
 select attempts,max_attempts into v_attempts,v_max from public.ai_solver_jobs where id=p_job_id for update;
 if not found then return query select false,0,0;return;end if;
 if p_retryable and v_attempts<v_max then
   update public.ai_solver_jobs set status='queued',worker_id=null,lease_until=null,error=left(coalesce(p_error,'worker error'),4000),
     stage='retry_queued',stage_detail=jsonb_build_object('attempts',v_attempts,'retryable',true),updated_at=now() where id=p_job_id;
   perform pgmq.send('study_ai_deep',jsonb_build_object('job_id',p_job_id::text),3);
   return query select true,v_attempts,v_max;
 else
   update public.ai_solver_jobs set status='failed',worker_id=null,lease_until=null,error=left(coalesce(p_error,'worker error'),4000),
     finished_at=now(),updated_at=now() where id=p_job_id;
   return query select false,v_attempts,v_max;
 end if;
end;
$$;

create or replace function public.ai_solver_queue_read(p_visibility_seconds integer default 120)
returns table(msg_id bigint,read_ct integer,enqueued_at timestamptz,vt timestamptz,message jsonb)
language sql security definer set search_path=public,extensions,pgmq
as $$
 select q.msg_id,q.read_ct,q.enqueued_at,q.vt,q.message
 from pgmq.read('study_ai_deep',greatest(15,least(600,coalesce(p_visibility_seconds,120))),1) q;
$$;

create or replace function public.ai_solver_queue_delete(p_msg_id bigint)
returns boolean language sql security definer set search_path=public,extensions,pgmq
as $$ select pgmq.delete('study_ai_deep',p_msg_id); $$;

revoke all on function public.ai_solver_create_job(text,text,jsonb,integer) from public,anon,authenticated;
revoke all on function public.ai_solver_claim_job(uuid,text,integer,integer) from public,anon,authenticated;
revoke all on function public.ai_solver_renew_job(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.ai_solver_update_stage(uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.ai_solver_complete_job(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.ai_solver_fail_job(uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.ai_solver_queue_read(integer) from public,anon,authenticated;
revoke all on function public.ai_solver_queue_delete(bigint) from public,anon,authenticated;

grant execute on function public.ai_solver_create_job(text,text,jsonb,integer) to service_role;
grant execute on function public.ai_solver_claim_job(uuid,text,integer,integer) to service_role;
grant execute on function public.ai_solver_renew_job(uuid,text,integer) to service_role;
grant execute on function public.ai_solver_update_stage(uuid,text,text,jsonb) to service_role;
grant execute on function public.ai_solver_complete_job(uuid,text,jsonb) to service_role;
grant execute on function public.ai_solver_fail_job(uuid,text,text,boolean) to service_role;
grant execute on function public.ai_solver_queue_read(integer) to service_role;
grant execute on function public.ai_solver_queue_delete(bigint) to service_role;
