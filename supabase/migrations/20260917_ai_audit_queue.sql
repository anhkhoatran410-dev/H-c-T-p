-- Audit queue hardening: queued audit events get a stable id for retry-safe batch sync.
alter table public.ai_request_audit
  add column if not exists event_id text;

create unique index if not exists ai_request_audit_event_uidx
  on public.ai_request_audit(event_id)
  where event_id is not null;

notify pgrst, 'reload schema';
