# STUDY TH local security verification

The repository contains `scripts/security-local.mjs` for validating the security architecture without consuming a Vercel deployment.

## Mock/local wiring test

Run from the repository root:

```bash
node scripts/security-local.mjs
```

This test uses an in-process mock for Redis/Supabase and verifies the actual security modules and source wiring. It covers:

- Admin lockdown -> Redis -> next-request visibility.
- Targeted device quarantine -> Redis -> next-request block.
- Response -> non-blocking audit sink, with response hash instead of raw response.
- Threat/monitoring signal -> Redis score -> automatic quarantine.
- AI JSON boundary, DLP/semantic guard, internal replay proof, and audit imports.

## Live shared-state smoke test

When a local environment has the real server credentials configured, run:

```bash
SECURITY_LOCAL_MODE=live node scripts/security-local.mjs
```

The live mode intentionally does not create or modify a Vercel deployment. It requires `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in the local environment.
