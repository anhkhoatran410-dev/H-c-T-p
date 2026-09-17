create table if not exists public.ai_request_audit (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  actor_hash text,
  device_hash text,
  endpoint text not null,
  method text not null default 'POST',
  status_code integer,
  outcome text not null default 'unknown',
  reason text,
  model text,
  response_hash text,
  response_length integer not null default 0,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_request_audit_created_idx
  on public.ai_request_audit(created_at desc);
create index if not exists ai_request_audit_actor_idx
  on public.ai_request_audit(actor_hash, created_at desc);
create index if not exists ai_request_audit_device_idx
  on public.ai_request_audit(device_hash, created_at desc);
create index if not exists ai_request_audit_request_idx
  on public.ai_request_audit(request_id);

alter table public.ai_request_audit enable row level security;
revoke all on public.ai_request_audit from anon, authenticated;
