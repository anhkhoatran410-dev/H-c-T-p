# STUDY TH — Global AI Circuit Breaker

The AI key pool supports up to 50 Gemini keys. When Upstash Redis is configured, Circuit Breaker state is shared across Vercel instances.

## Vercel Environment Variables

Set these as server-side environment variables only:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `INTERNAL_GATEWAY_SECRET`

Never expose the Redis standard token or gateway secret to the frontend.

## Key Pool

Gemini keys can be configured as:

- `GEMINI_API_KEY`
- `GEMINI_API_KEY_2` ... `GEMINI_API_KEY_50`
- or `GEMINI_API_KEYS` as a comma-separated server-side list

## Circuit Behaviour

- `401/403`: key circuit opens immediately for 60 seconds.
- `429/5xx/network timeout`: failure counter increases; circuit opens after 3 failures.
- After cooldown, one server instance gets a `HALF_OPEN` probe lock for 15 seconds.
- Successful probe closes the circuit and resets failures.
- If no healthy key is available, the AI request fails closed instead of falling back to an unhealthy key.

Without the Upstash variables, the system falls back to per-instance in-memory state; the AI key pool still functions, but circuit state is not globally shared.

Upstash REST is used over HTTPS so the shared state works in serverless runtimes without a long-lived TCP connection.
