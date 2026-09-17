# STUDY TH Security Architecture

## Current hardened request / response model

The architecture separates the normal request path from shared state, audit persistence, and supervisory controls.

```text
                         [10] MONITORING / SIEM + AUTO-RESPONSE
                         observe -> detect -> score -> respond
                              ⇅              ⇅
                       [5] REDIS / STATE BUS
                         ⇅       ⇅        ⇅
                      THREAT   RESILIENCE  ADMIN

USER / EXTERNAL AI
        |
        v
   [1] EDGE
        |
        v
   [2] THREAT
        |
        v
 [3] CHALLENGE
        |
        v
    [4] AUTH ------------------- privileged scope -----------------> [8] ADMIN
        |
        v
   [6] GATEWAY
        |
        v
 [6A] AI INPUT GUARD
        |
        v
 [6B] DLP + SEMANTIC GUARDRAIL
        |
        v
 [7] AI RESILIENCE
        |
        +----------------------> [11] RESPONSE GUARD
        |                              |
        |                              +-------------------> [9] AUDIT QUEUE
        |                              |                         |
        |                              |                         v
        |                              |                     [9A] AUDIT WORKER
        |                              |                         |
        |                              |                         v
        |                              |                     SUPABASE
        |                              |
        |                              v
        |                          [6] GATEWAY
        |                              |
        |                              v
        +-------------------------- USER / EXTERNAL AI
```

### 1. Request path

The normal AI request path is:

```text
User / External AI
  -> Edge
  -> Threat
  -> Challenge
  -> Auth
  -> Gateway
  -> AI Input Guard
  -> DLP + Semantic Guardrail
  -> AI Resilience
```

AI Input Guard is the bounded pre-filter for prompt size/history limits and high-confidence prompt-abuse patterns.

DLP + Semantic Guardrail is a bounded in-process defense-in-depth ingress layer. DLP conservatively redacts obvious email addresses, Vietnamese phone/ID patterns, JWT-like tokens, common API-key formats, bearer tokens, and additional high-risk secret formats before provider execution. The semantic guardrail evaluates bounded multi-turn context and blocks only when at least two independent high-confidence instruction-hijacking/exfiltration signals are present. It is heuristic and does not claim perfect semantic jailbreak detection.

The same ingress layer is used by both the AI solve path and the public support-AI path. The privileged Admin Copilot also applies DLP to context assembled from Supabase and repository sources before that context is placed in the provider prompt.

### 2. Early internal proof

The internal hop between the public AI gateway and the solve core is protected with HMAC + timestamp + nonce. This is **internal channel authentication and replay protection**, not an end-user credential.

```text
Threat Defense
     |
     v
Internal Proof
(HMAC + timestamp + nonce)
     |
     v
AI processing
```

The proof is generated when the gateway is about to call the internal solve core and is verified by the core before expensive solve processing continues. Nonce state has a bounded replay window.

### 3. Response path

For an AI-backed request:

```text
AI / model provider
        |
        v
[7] AI RESILIENCE
        |
        v
[11] RESPONSE GUARD
        |
        +---------------------> [9] BOUNDED AUDIT QUEUE
        |                              |
        |                              v
        |                         [9A] AUDIT WORKER
        |                              |
        |                              +---- retry + backoff
        |                              |
        |                              v
        |                         [9B] BOUNDED DLQ
        |                              |
        |                              v
        |                           SUPABASE
        |
        v
[6] GATEWAY
        |
        v
User / External AI
```

Response Guard protects the outbound payload. Audit persistence is a separate best-effort branch. Queue admission is atomic and bounded; when the queue is full, audit events are counted as dropped instead of consuming unbounded memory.

The worker writes batches to `ai_request_audit` after bounded retry/backoff. When Supabase remains unavailable after retries, failed events move to a bounded dead-letter queue instead of being returned to the main queue. This prevents a database outage from creating an unbounded feedback loop.

The audit path may use a dedicated Redis resource through `AUDIT_REDIS_REST_URL` / `AUDIT_REDIS_REST_TOKEN`. Without that optional configuration it falls back to the existing Redis connection, but queue and DLQ limits still apply.

Audit records contain metadata and one-way hashes rather than raw AI responses or credentials.

### 4. Redis is the shared state bus

Redis is **shared state, not a mandatory sequential request step**:

```text
                         [5] REDIS / STATE BUS
                       ⇅          ⇅           ⇅
                 Threat state  AI state   Admin actions
                       ⇅          ⇅           ⇅
                    Edge      Resilience    Admin
```

The critical security state includes distributed rate-limit state, replay nonces, challenge state, threat scores, quarantine/block state, AI circuit-breaker state, and emergency AI lockdown state.

Audit state is separately bounded. A dedicated audit Redis resource can be used so audit backlog pressure does not compete with critical security state.

Admin actions that quarantine a user/device or enable an AI lockdown write the corresponding state to Redis so subsequent requests see the change immediately.

### 5. Monitoring / SIEM + Auto-Response

The repository implements active defensive reactions in request-path security modules (quarantine after accumulated violations, adaptive challenge, provider circuit state, and emergency AI lockdown). Monitoring is supervisory and does not become a mandatory request hop.

```text
              [10] MONITORING / SIEM + AUTO-RESPONSE
                           ⇅
                    [5] REDIS / STATE BUS
                           ⇅
          +----------------+----------------+
          |                |                |
        THREAT         AI RESILIENCE      ADMIN
```

Monitoring consumes security state/events and the defensive layers update shared state that Monitoring/Admin can inspect.

### 6. Admin branch

Admin is a privileged branch, not a mandatory hop for ordinary users:

```text
Auth
 |
 +-----> Admin API
            |
            +-----> Supabase (configuration/data)
            |
            +-----> Redis (lockdown / subject quarantine)
```

A global AI lockdown is stored in Redis. Targeted subject/device quarantine is also stored in Redis using a one-way fingerprint. Subsequent AI requests check this shared state before entering expensive processing.

### 7. Data model

```text
                 AI processing
                      |
          +-----------+------------+
          |                        |
      Domain data             Security audit
   attempts/support          ai_request_audit
          |                        |
       Supabase                 Supabase

                    Audit failure path
                          |
                          v
                    Bounded DLQ
```

User-visible domain history and support conversations continue using their existing tables. The security audit table is intentionally separate so security telemetry does not become a critical dependency of ordinary user response delivery.

### 8. Enterprise boundaries

The following are **not enabled by source code alone** and must not be described as current capabilities without matching provider configuration:

- Redis Cluster / Multi-AZ or a separately provisioned audit Redis resource.
- Supabase read replicas / database failover.
- Cloudflare Enterprise WAF / advanced bot management in front of Vercel.
- Native Android/iOS attestation such as Play Integrity or Apple App Attest.
- Private provider connectivity such as VPC-only / Private Service Connect.
- HSM/KMS-backed key custody for external secret-management infrastructure.

## Final rules for diagrams

- Monitoring/SIEM + Auto-Response is supervisory; it does not become a mandatory sequential request hop.
- Monitoring and the defensive layers exchange state through Redis.
- Admin lockdown and subject/device quarantine write to Redis.
- Response Guard has a **parallel non-blocking audit branch**.
- Audit queue and DLQ are explicitly bounded.
- Failed audit batches do **not** loop back into the main queue indefinitely.
- Audit records should contain hashes/metadata, not raw secrets or unnecessary full AI responses.
- HMAC + timestamp + nonce protects the internal gateway-to-core channel and is not presented as an end-user credential.
- Redis is shared state, not a mandatory sequential request hop.
- Admin is a conditional privileged branch, never the default request path.
- Never place API keys, secrets, service-role credentials, Redis tokens, admin passwords, or other credentials in diagrams or documentation.
