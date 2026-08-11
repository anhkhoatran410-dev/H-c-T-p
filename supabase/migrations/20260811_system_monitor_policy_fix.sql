-- Fix maintenance toggle permissions for authenticated Admin sessions.
alter table public.system_control enable row level security;
drop policy if exists system_control_admin_update on public.system_control;
create policy system_control_admin_update on public.system_control
for update to authenticated
using (true)
with check (true);
drop policy if exists system_control_admin_insert on public.system_control;
create policy system_control_admin_insert on public.system_control
for insert to authenticated
with check (true);
notify pgrst, 'reload schema';
