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
        |                              +-------------------> [9] AUDIT DATA
        |                              |                     (non-blocking)
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

DLP + Semantic Guardrail is a defense-in-depth ingress layer. DLP conservatively redacts obvious email addresses, Vietnamese phone/ID patterns, JWT-like tokens, common API-key formats, bearer tokens, and additional high-risk secret formats before provider execution. The semantic guardrail evaluates a bounded multi-turn context and blocks only when at least two independent high-confidence instruction-hijacking/exfiltration signals are present. It is heuristic and does not claim perfect semantic jailbreak detection.

The same ingress layer is used by both the AI solve path and the public support-AI path. The privileged Admin Copilot also applies DLP to the context assembled from Supabase and repository sources before that context is placed in the provider prompt.

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

The proof is generated only when the gateway is about to call the internal solve core and is verified by the core before expensive solve processing continues.

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
        +---------------------> [9] AUDIT DATA
        |                         hash / metadata only
        |                         non-blocking
        v
[6] GATEWAY
        |
        v
User / External AI
```

Response Guard protects the outbound payload. Audit persistence is a separate best-effort branch: it stores metadata such as request/actor/device hashes, endpoint, status, model, latency, response length and response hash rather than a copy of the full AI response. Failure of the audit sink must not block delivery to the user.

Normal application data remains in the existing domain tables (for example attempts and support messages). `ai_request_audit` is the security/audit trail for the AI request/response path.

### 4. Redis is the shared state bus

Redis is **shared state, not a mandatory sequential request step**:

```text
                         [5] REDIS / STATE BUS
                       ⇅          ⇅           ⇅
                 Threat state  AI state   Admin actions
                       ⇅          ⇅           ⇅
                    Edge      Resilience    Admin
```

It can hold distributed rate-limit state, replay nonces, challenge state, threat scores, quarantine/block state, AI circuit-breaker state, and emergency AI lockdown state.

Admin actions that quarantine a user/device or enable an AI lockdown write the corresponding state to Redis so subsequent requests see the change immediately.

### 5. Monitoring / SIEM + Auto-Response

The repository already implements active defensive reactions in the request-path security modules (quarantine after accumulated violations, adaptive challenge, provider circuit state, and emergency AI lockdown). Therefore the diagram uses **Monitoring / SIEM + Auto-Response**, not a vague passive "SOAR" box.

The supervisory relationship is explicitly two-way through Redis:

```text
              [10] MONITORING / SIEM + AUTO-RESPONSE
                           ⇅
                    [5] REDIS / STATE BUS
                           ⇅
          +----------------+----------------+
          |                |                |
        THREAT         AI RESILIENCE      ADMIN
```

Monitoring consumes security state/events and the defensive layers update shared state that Monitoring/Admin can inspect. The request itself still follows the normal sequential path and does not have to pass through Monitoring.

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

A global AI lockdown is stored in Redis. A targeted subject/device quarantine is also stored in Redis using a one-way fingerprint. Subsequent AI requests check this shared state before entering expensive processing.

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
```

User-visible domain history and support conversations continue using their existing tables. The security audit table is intentionally separate so security telemetry does not become a critical dependency of ordinary user response delivery.

### 8. Enterprise roadmap boundaries

The following are **not enabled by this repository patch** and must not be described as current production capabilities:

- Cloudflare Enterprise WAF / advanced bot management in front of Vercel.
- Native Android/iOS attestation such as Play Integrity or Apple App Attest.
- Google Cloud Private Service Connect / VPC-only provider connectivity from the hosting environment.

Those require separate platform/account/network configuration.

## Final rules for diagrams

- Monitoring/SIEM + Auto-Response is supervisory; it does not become a mandatory sequential request hop.
- Monitoring and the defensive layers exchange state through Redis.
- Admin lockdown and subject/device quarantine write to Redis.
- Response Guard has a **parallel non-blocking audit branch** to `ai_request_audit`.
- Audit records should contain hashes/metadata, not raw secrets or unnecessary full AI responses.
- Normal application/domain data remains in its existing Supabase tables.
- HMAC + timestamp + nonce protects the internal gateway-to-core channel and is not presented as an end-user credential.
- Redis is shared state, not a mandatory sequential request hop.
- Admin is a conditional privileged branch, never the default request path.
- Never place API keys, secrets, service-role credentials, Redis tokens, admin passwords, or other credentials in diagrams or documentation.
