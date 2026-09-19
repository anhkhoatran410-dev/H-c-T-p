-- STUDY TH: harden the Deep/VMO background job queue.
-- Fixes:
--  * claim_job / fail_job raised 'column reference "attempts" is ambiguous' (plpgsql OUT params vs columns)
--  * claim_job now reports WHY it did not claim (busy / running_elsewhere / finished / exhausted / missing)
--  * attempts cap is enforced when an expired lease is reclaimed (poison-job protection)
--  * queue_set_vt lets the worker extend/shorten message visibility
--  * ai_solver_reap re-queues expired/lost jobs and purges old finished jobs

drop function if exists public.ai_solver_claim_job(uuid,text,integer);
drop function if exists public.ai_solver_claim_job(uuid,text,integer,integer);

create or replace function public.ai_solver_claim_job(
  p_job_id uuid, p_worker_id text, p_lease_seconds integer default 120, p_max_concurrency integer default 1
) returns table(claimed boolean, reason text, attempts integer, payload jsonb)
language plpgsql security definer
set search_path=public
as $$
#variable_conflict use_column
declare
  j public.ai_solver_jobs%rowtype;
  active_count integer;
  v_lease integer;
  v_attempts integer;
  v_payload jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('study-ai-deep-concurrency')::bigint);
  select * into j from public.ai_solver_jobs where id=p_job_id for update;
  if not found then
    return query select false,'missing'::text,0,null::jsonb; return;
  end if;
  if j.status in ('done','failed') then
    return query select false,'finished'::text,j.attempts,null::jsonb; return;
  end if;
  if j.status='running' and j.lease_until is not null and j.lease_until>=now() then
    return query select false,'running_elsewhere'::text,j.attempts,null::jsonb; return;
  end if;
  if j.status='running' and j.attempts>=j.max_attempts then
    update public.ai_solver_jobs
       set status='failed',worker_id=null,lease_until=null,finished_at=now(),updated_at=now(),
           error=left(coalesce(j.error,'')||' [lease expired; max attempts reached]',4000)
     where id=p_job_id;
    return query select false,'exhausted'::text,j.attempts,null::jsonb; return;
  end if;
  select count(*) into active_count from public.ai_solver_jobs x
   where x.status='running' and x.lease_until is not null and x.lease_until>=now() and x.id<>p_job_id;
  if active_count >= greatest(1,least(20,coalesce(p_max_concurrency,1))) then
    return query select false,'busy'::text,j.attempts,null::jsonb; return;
  end if;
  v_lease:=greatest(15,least(600,coalesce(p_lease_seconds,120)));
  update public.ai_solver_jobs
     set status='running',worker_id=left(coalesce(p_worker_id,'worker'),120),
         lease_until=now()+make_interval(secs=>v_lease),
         started_at=coalesce(started_at,now()),attempts=j.attempts+1,updated_at=now()
   where id=p_job_id
   returning public.ai_solver_jobs.attempts,public.ai_solver_jobs.payload into v_attempts,v_payload;
  return query select true,'claimed'::text,v_attempts,v_payload;
end;
$$;

create or replace function public.ai_solver_fail_job(
  p_job_id uuid,p_worker_id text,p_error text,p_retryable boolean default true
) returns table(requeued boolean, attempts integer, max_attempts integer)
language plpgsql security definer
set search_path=public,extensions,pgmq
as $$
#variable_conflict use_column
declare v_attempts integer; v_max integer; v_worker text; v_status text;
begin
  select j.attempts,j.max_attempts,j.worker_id,j.status into v_attempts,v_max,v_worker,v_status
    from public.ai_solver_jobs j where j.id=p_job_id for update;
  if not found then return query select false,0,0; return; end if;
  if v_status<>'running' or v_worker is distinct from left(coalesce(p_worker_id,'worker'),120) then
    return query select false,v_attempts,v_max; return;
  end if;
  if p_retryable and v_attempts<v_max then
    update public.ai_solver_jobs
       set status='queued',worker_id=null,lease_until=null,error=left(coalesce(p_error,'worker error'),4000),
           stage='retry_queued',stage_detail=jsonb_build_object('attempts',v_attempts,'retryable',true),updated_at=now()
     where id=p_job_id;
    perform pgmq.send('study_ai_deep',jsonb_build_object('job_id',p_job_id::text),3);
    return query select true,v_attempts,v_max;
  else
    update public.ai_solver_jobs
       set status='failed',worker_id=null,lease_until=null,error=left(coalesce(p_error,'worker error'),4000),
           finished_at=now(),updated_at=now()
     where id=p_job_id;
    return query select false,v_attempts,v_max;
  end if;
end;
$$;

create or replace function public.ai_solver_queue_set_vt(p_msg_id bigint,p_seconds integer)
returns boolean language sql security definer set search_path=public,extensions,pgmq
as $$ select exists (select 1 from pgmq.set_vt('study_ai_deep',p_msg_id,greatest(0,least(900,coalesce(p_seconds,30))))); $$;

create or replace function public.ai_solver_reap(p_retention_days integer default 7)
returns table(requeued integer, failed integer, resent integer, purged integer)
language plpgsql security definer
set search_path=public,extensions,pgmq
as $$
#variable_conflict use_column
declare rec record; n_requeued integer:=0; n_failed integer:=0; n_resent integer:=0; n_purged integer:=0; has_msg boolean;
begin
  perform pg_advisory_xact_lock(hashtext('study-ai-deep-reaper')::bigint);

  for rec in
    select j.id,j.attempts,j.max_attempts from public.ai_solver_jobs j
     where j.status='running' and (j.lease_until is null or j.lease_until<now())
     for update skip locked
  loop
    if rec.attempts>=rec.max_attempts then
      update public.ai_solver_jobs
         set status='failed',worker_id=null,lease_until=null,finished_at=now(),updated_at=now(),
             error=left(coalesce(error,'')||' [lease expired; max attempts reached]',4000)
       where id=rec.id;
      n_failed:=n_failed+1;
    else
      update public.ai_solver_jobs
         set status='queued',worker_id=null,lease_until=null,stage='lease_expired_requeued',updated_at=now()
       where id=rec.id;
      select exists(select 1 from pgmq.q_study_ai_deep m where m.message->>'job_id'=rec.id::text) into has_msg;
      if not has_msg then perform pgmq.send('study_ai_deep',jsonb_build_object('job_id',rec.id::text)); end if;
      n_requeued:=n_requeued+1;
    end if;
  end loop;

  for rec in
    select j.id from public.ai_solver_jobs j
     where j.status='queued' and j.updated_at<now()-interval '90 seconds'
       and not exists (select 1 from pgmq.q_study_ai_deep m where m.message->>'job_id'=j.id::text)
     for update skip locked
  loop
    perform pgmq.send('study_ai_deep',jsonb_build_object('job_id',rec.id::text));
    update public.ai_solver_jobs set updated_at=now() where id=rec.id;
    n_resent:=n_resent+1;
  end loop;

  delete from public.ai_solver_jobs
   where status in ('done','failed') and finished_at is not null
     and finished_at<now()-make_interval(days=>greatest(1,coalesce(p_retention_days,7)));
  get diagnostics n_purged=row_count;

  return query select n_requeued,n_failed,n_resent,n_purged;
end;
$$;

revoke all on function public.ai_solver_claim_job(uuid,text,integer,integer) from public,anon,authenticated;
revoke all on function public.ai_solver_fail_job(uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.ai_solver_queue_set_vt(bigint,integer) from public,anon,authenticated;
revoke all on function public.ai_solver_reap(integer) from public,anon,authenticated;
grant execute on function public.ai_solver_claim_job(uuid,text,integer,integer) to service_role;
grant execute on function public.ai_solver_fail_job(uuid,text,text,boolean) to service_role;
grant execute on function public.ai_solver_queue_set_vt(bigint,integer) to service_role;
grant execute on function public.ai_solver_reap(integer) to service_role;
