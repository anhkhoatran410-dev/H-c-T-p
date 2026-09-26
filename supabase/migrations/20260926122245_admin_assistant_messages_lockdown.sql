-- P0: Admin Copilot history must not be readable/writable by public roles.
drop policy if exists "admin_assistant_messages_read" on public.admin_assistant_messages;
drop policy if exists "admin_assistant_messages_write" on public.admin_assistant_messages;

revoke all privileges on table public.admin_assistant_messages from anon, authenticated, public;
grant select, insert on table public.admin_assistant_messages to service_role;
