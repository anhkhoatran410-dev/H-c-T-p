-- Security hardening: admin-managed configuration must not be writable by public clients.
-- Public read policies remain so the learner-facing support UI can discover active
-- support accounts and enabled bot rules. Server-side Admin APIs use service role.

revoke insert, update, delete on table public.support_accounts from anon, authenticated;
revoke insert, update, delete on table public.support_bot_rules from anon, authenticated;

drop policy if exists support_accounts_write on public.support_accounts;
drop policy if exists support_bot_rules_write on public.support_bot_rules;

notify pgrst, 'reload schema';
