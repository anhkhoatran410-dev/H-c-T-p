# STUDY TH — Production Security Hardening

This pass closes the three remaining architecture items without placing secrets, tokens, or provider credentials in source code.

## 1. Redis → Supabase audit log sync

The request path now writes audit events to `study-th:audit:queue` in Redis instead of inserting into Supabase directly. A dedicated `/api/_audit-worker` endpoint removes a bounded batch atomically, writes the batch to Supabase, and restores the batch to Redis when the database write fails.

Each queued event has an `event_id`. Supabase has a partial unique index on that field so a worker retry is idempotent and does not create duplicate audit rows.

A scheduled GitHub Actions workflow calls the worker every 15 minutes. Configure these repository secrets without committing their values:

- `SECURITY_AUDIT_WORKER_URL`: the deployed audit-worker endpoint.
- `SECURITY_AUDIT_CRON_SECRET`: the same random secret configured as `CRON_SECRET` for the deployed function.

The audit row contains hashes/metadata only; the raw AI response is not stored.

## 2. Admin security-state protection

`system_control` and `system_incidents` no longer accept direct `anon`/`authenticated` table access. The server-side Admin API remains the controlled path and uses the service role after its Admin session check.

Admin login now supports TOTP MFA when `ADMIN_MFA_TOTP_SECRET` is configured. MFA is fail-closed once the secret is present, and an Admin session created without the MFA claim is rejected after MFA is enabled.

The existing Admin Redis actions remain behind the Admin session and explicit confirmation checks.

## 3. Dynamic key-pool cache warming

The existing dynamic AI key pool now performs a warm/synchronization step before selecting a provider key. Redis stores only key identifiers and fingerprints, never the provider secret itself.

The warm state is derived from the current server environment secret pool. A Redis restart clears that state, causing the next AI request to rebuild it before selecting a key.

## Operational boundary

This implementation uses the services already present in the project: Vercel Functions, Upstash Redis, Supabase, and GitHub Actions. It does not claim an external WAF, private network, mTLS, hardware attestation, or other infrastructure that is not configured in the repository.
