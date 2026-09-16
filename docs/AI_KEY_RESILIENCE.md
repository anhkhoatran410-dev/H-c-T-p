# AI Key Resilience

STUDY TH supports a server-side AI key pool with two protection mechanisms:

- **Circuit Breaker:** a key is isolated after repeated provider failures or an authentication/configuration failure. After the cooldown it receives a single half-open probe; success closes the circuit, failure opens it again.
- **Dynamic Key Pooling:** requests select among configured healthy keys instead of pinning all traffic to one key. The selector excludes keys already attempted for the current request.

## Environment variables

Use server-side Vercel Environment Variables only. Never place real credentials in Git.

```text
GEMINI_API_KEY=key-1
GEMINI_API_KEY_2=key-2
GEMINI_API_KEY_3=key-3
...
```

An optional comma-separated pool is also supported:

```text
GEMINI_API_KEYS=key-1,key-2,key-3
```

The runtime accepts up to 50 numbered keys. Duplicate keys are treated as one key.

## Behaviour

- 401/403/400/404: key is isolated immediately.
- Other transient failures: key opens after 3 consecutive failures.
- Cooldown: 60 seconds.
- Half-open probe window: 15 seconds, one probe at a time per warm server instance.
- Health endpoint exposes only key IDs/fingerprints and circuit state; raw secrets are never returned.

This is application-level resilience. In a serverless environment, in-memory circuit state is scoped to a warm function instance. A persistent shared breaker can be added later with a dedicated state store if cross-instance coordination is required.
