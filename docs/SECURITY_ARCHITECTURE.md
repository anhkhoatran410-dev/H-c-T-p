# STUDY TH Security Architecture

## Optimized production security model

The security design is layered around one strict request path, shared state, an AI input guard, and a separate supervisory control plane.

```text
                           ┌─────────────────────────────────────┐
                           │       [10] MONITORING / SOAR       │
                           │ metrics · alerts · incident state  │
                           └──────────────┬──────────────────────┘
                                          │ bounded response
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    v                     v                     v
              [5] REDIS            [7] AI RESILIENCE      [8] ADMIN
          shared security state     pool / breaker /       lockdown /
          rate / nonce / score     provider recovery     incident control

USER / EXTERNAL AI
        │
        v
┌───────────────────┐
│ [1] EDGE           │  HTTPS · security headers · request limits
└─────────┬─────────┘
          v
┌───────────────────┐
│ [2] THREAT         │  actor scoring · burst detection · quarantine
└─────────┬─────────┘
          v
┌───────────────────┐
│ [3] CHALLENGE      │  adaptive proof-of-work when risk is elevated
└─────────┬─────────┘
          v
┌───────────────────┐
│ [4] AUTH           │  origin · session/admin scope · internal auth
└─────────┬─────────┘
          │
          ├──────── privileged scope ────────> [8] ADMIN
          │                                      │
          │                                      └──> lockdown / incident actions
          v
┌───────────────────┐
│ [6] AI GATEWAY     │  route · replay · rate · budget boundary
└─────────┬─────────┘
          v
┌───────────────────┐
│ [6A] AI INPUT      │  prompt-injection signals · bounded scan
│      GUARD         │  high-confidence control/exfil patterns blocked
└─────────┬─────────┘
          v
┌──────────────────────────────────────────────┐
│ [7] AI RESILIENCE                            │
│ dynamic key pool · circuit breaker · retry  │
│ provider failure classification              │
└─────────┬───────────────────────┬────────────┘
          │                       │
          v                       v
     [9] DATA                [11] RESPONSE GUARD
  persistence / logs       size + secret redaction
                                  │
                                  v
                             [6] GATEWAY
                                  │
                                  v
                         USER / EXTERNAL AI

[5] REDIS is shared state across applicable layers; it is NOT a mandatory
request hop. [10] MONITORING / SOAR supervises the system and is NOT in the
normal request path.
```

## 1. Normal request path

```text
Requester
  -> [1] Edge
  -> [2] Threat Defense
  -> [3] Adaptive Challenge (only when required)
  -> [4] Authentication / Internal Authorization
  -> [6] AI Gateway
  -> [6A] AI Input Guard
  -> [7] AI Resilience
```

The challenge is conditional: trusted/low-risk traffic can continue without a proof-of-work step. Admin is also conditional and is never part of the ordinary user request path.

## 2. AI input and response controls

The input guard is intentionally a **signal-and-policy layer**, not a promise to detect every jailbreak. It detects a small set of high-confidence attempts to override hidden instructions or extract credentials and records lower-confidence signals for the threat system. It does not rewrite normal study questions.

The response guard limits response size and redacts configured secrets before data leaves the gateway. Frontend rendering must still use a safe Markdown/HTML renderer; server-side secret redaction is not a substitute for output encoding in the browser.

## 3. AI resilience boundaries

The Dynamic Key Pool and Circuit Breaker improve resilience against individual credential failures and transient provider errors. **They do not increase Gemini project quota and must not be treated as a way to bypass provider limits.** A 429 can represent project-level quota exhaustion, so the system should honor provider retry guidance and degrade gracefully when the whole pool is constrained.

Fallback models/providers should only be enabled when their credentials, quotas, privacy terms, and application behavior have been explicitly configured and tested. Automatic creation or acquisition of new provider credentials is outside the security layer.

## 4. Shared-state plane

```text
                         [5] REDIS
                            │
       ┌────────────────────┼────────────────────┐
       v                    v                    v
 rate limiting       replay / nonce       threat / quarantine
       │                    │                    │
       └────────────────────┼────────────────────┘
                            v
                    AI circuit-breaker state
```

Redis can provide distributed state for rate limiting, replay protection, threat/quarantine state, challenge state, sessions, and AI circuit-breaker state. Local fallbacks are bounded where implemented. The gateway should remain protected if Redis is unavailable; it must not silently become unlimited because a shared-state service failed.

A full Redis Cluster/Multi-AZ design is an infrastructure decision and is not required merely to run this Vercel serverless architecture. The practical target here is bounded local fallback plus a managed Redis deployment with appropriate availability for the selected plan.

## 5. Privileged control plane

```text
[4] AUTH
   │
   └── verified admin scope ──> [8] ADMIN
                                  │
                                  ├── incident actions
                                  └── emergency AI lockdown
```

Admin operations remain isolated from the normal user path and require the application's admin authentication/authorization checks.

## 6. Monitoring / SOAR plane

```text
                 [10] MONITORING / SOAR
                  /        |         \
                 v         v          v
              REDIS    AI RESILIENCE  ADMIN
               state      health      response
```

Monitoring is supervisory. It observes security signals and can trigger bounded defensive responses; it does not become another sequential request-processing layer.

## 7. Improvements deliberately not added as mandatory request hops

- **mTLS/service mesh:** useful for multi-service private networks, but it is not a natural mandatory hop between Vercel serverless functions. Internal HMAC + HTTPS is the current application-level control.
- **Semantic cache:** not enabled by default because prompts and answers can contain private student data. Any cache would need tenant/user isolation, encryption, TTLs, and an explicit privacy policy.
- **LLM-as-a-Judge on every response:** not enabled by default because it doubles AI work/cost and can add latency. It is better reserved for selected high-impact workflows and evaluated separately.
- **Kafka/RabbitMQ:** not required for the current scale. Asynchronous logging can be introduced later if telemetry volume justifies it.
- **Automatic API-key provisioning:** intentionally excluded. Key rotation manages credentials already configured by the operator; it does not create or obtain new credentials.

## 8. Why this model is the optimized version

- **Single clear request path:** fewer ambiguous arrows and no accidental dependency on Admin or Redis.
- **Conditional controls:** Challenge and Admin are shown only when their conditions are met.
- **AI input is explicitly protected:** high-confidence prompt-control/exfiltration patterns are handled before the provider call.
- **AI resilience is isolated:** provider failures, configured-key rotation, circuit breaking, and recovery stay inside the AI boundary.
- **Response Guard is outbound:** response-size and secret-redaction checks happen before data leaves the gateway.
- **Shared state is explicit:** Redis supports distributed controls without becoming a conceptual request hop.
- **Monitoring is horizontal:** observability and incident response remain separate from request processing.
- **No credentials in the model:** API keys, service-role credentials, Redis tokens, admin passwords, and other secrets must never appear in diagrams or documentation.

## 9. Security model boundaries

This architecture describes defensive controls implemented by the application. It does not claim that the system is invulnerable or that every automated agent can be identified perfectly. Production effectiveness must be measured with bounded, authorized tests and real deployment telemetry.
