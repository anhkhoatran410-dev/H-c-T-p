# Gemini API key pool

The security branch supports a Gemini key pool with up to 50 entries. The pool is for **keys/projects that you legitimately control**. It is not a mechanism for bypassing Gemini rate limits or account restrictions.

## Environment variable formats

The runtime accepts either indexed variables:

```text
GEMINI_API_KEY=...
GEMINI_API_KEY_2=...
GEMINI_API_KEY_3=...
...
GEMINI_API_KEY_50=...
```

or one comma-separated variable:

```text
GEMINI_API_KEYS=key1,key2,key3
```

Indexed variables are easiest to manage in Vercel. Keep all values server-side and never put them in frontend source code, HTML, client bundles, screenshots, or Git commits.

## What the pool does

`api/_ai-resilience.js` fingerprints key material without logging the raw value, rotates across available entries, tracks usage, and keeps a circuit breaker per key. Authentication failures (`401/403`) open the circuit immediately; rate-limit/server/network failures accumulate toward the circuit threshold.

`api/_gemini-network-guard.js` removes incoming `x-goog-api-key` headers and injects a server-side pool key for requests sent to `generativelanguage.googleapis.com`.

Run the local configuration check with:

```bash
node scripts/check-gemini-pool.mjs
```

It prints only the configured count and short fingerprints. It never prints the key values.

## Important quota note

Gemini API rate limits are measured at the **project** level, not per API key. Adding several keys to the same project does not multiply that project's quota. For higher legitimate capacity, use the appropriate Gemini/Google Cloud billing tier or request a quota increase, and use multiple projects only when those projects are legitimately managed by you and permitted by Google's terms.

Do not use leaked/public keys, buy other people's keys, or create accounts solely to evade service limits.
