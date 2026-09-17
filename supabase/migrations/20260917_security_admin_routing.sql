-- Keep security-sensitive system state server-side only.
-- The Admin API uses the Supabase service role after Admin session checks.
revoke all on table public.system_control from anon, authenticated;
revoke all on table public.system_incidents from anon, authenticated;

drop policy if exists system_control_admin_update on public.system_control;
drop policy if exists system_control_admin_insert on public.system_control;
drop policy if exists system_incidents_admin_read on public.system_incidents;

notify pgrst, 'reload schema';
