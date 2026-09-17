# STUDY TH — Production Security Hardening

This pass hardens the AI audit path against backlog growth and isolates audit pressure from critical security state. No secrets, tokens, or provider credentials are placed in source code.

## 1. Redis → Supabase audit log sync

The request path writes audit events to a bounded Redis audit queue instead of inserting into Supabase directly. Queue admission is atomic and capped by `AUDIT_QUEUE_MAX` (default 5,000; configurable within a safe bound). When the queue is full, new audit events are deliberately dropped and counted rather than allowed to consume unbounded memory.

The audit path can use `AUDIT_REDIS_REST_URL` / `AUDIT_REDIS_REST_TOKEN` to place the audit queue on a dedicated Redis resource. Without those settings, it falls back to the existing Redis connection for compatibility; the bounded queue still prevents unbounded growth.

A dedicated `/api/_audit-worker` endpoint removes a bounded batch atomically and writes the batch to Supabase. Supabase failures use bounded retry with exponential backoff and jitter, then move the failed events into a bounded DLQ (`AUDIT_DLQ_MAX`, default 1,000) instead of restoring them to the main queue. Once the DLQ is full, the oldest DLQ item is evicted and a drop counter is incremented. This prevents a database outage from creating a queue feedback loop against Redis.

Each queued event has an `event_id`. Supabase has a unique index on that field so a worker retry is idempotent and does not create duplicate audit rows.

A scheduled GitHub Actions workflow calls the worker every 15 minutes. Configure worker endpoint/cron credentials as repository or deployment secrets without committing their values.

The audit row contains hashes/metadata only; the raw AI response is not stored.

## 2. Admin security-state protection

`system_control` and `system_incidents` no longer accept direct `anon`/`authenticated` table access. The server-side Admin API remains the controlled path and uses the service role after its Admin session check.

Admin login supports TOTP MFA when the corresponding server secret is configured. MFA is fail-closed once enabled, and an Admin session created without the MFA claim is rejected after MFA is enabled.

The existing Admin Redis actions remain behind the Admin session and explicit confirmation checks.

## 3. Dynamic key-pool cache warming

The existing dynamic AI key pool performs a warm/synchronization step before selecting a provider key. Redis stores only key identifiers and fingerprints, never the provider secret itself.

## 4. Guard performance boundary

The DLP + semantic ingress guard remains a bounded, in-process heuristic layer. It does not invoke a second LLM. Expensive/deeper analysis should be reserved for suspicious traffic rather than placed on every normal request.

## Operational boundary

This implementation uses the services already present in the project: Vercel Functions, Redis, Supabase, and GitHub Actions. It does not claim Redis Cluster/Multi-AZ, external WAF, private networking, mTLS, hardware attestation, or managed HSM/KMS capabilities that require separate provider configuration.
