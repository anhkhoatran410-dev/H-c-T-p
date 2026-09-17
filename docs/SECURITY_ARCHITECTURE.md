# STUDY TH Security Architecture

## Optimized production security model

The security design is layered around one strict request path, shared state, and a separate supervisory control plane.

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
│ [6] AI GATEWAY     │  route validation · replay protection · limits
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
  -> [7] AI Resilience
```

The challenge is conditional: trusted/low-risk traffic can continue without a proof-of-work step. Admin is also conditional and is never part of the ordinary user request path.

## 2. AI processing and response path

```text
External AI / model provider
          |
          v
   [7] AI RESILIENCE
          |
          +---------> [9] DATA
          |
          v
 [11] RESPONSE GUARD
          |
          v
    [6] AI GATEWAY
          |
          v
      Requester
```

Data persistence and response delivery are deliberately separate branches. The model must never imply `AI Resilience -> Data -> Response`.

## 3. Shared-state plane

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

Redis can provide distributed state for rate limiting, replay protection, threat/quarantine state, challenge state, sessions, and AI circuit-breaker state. Local fallbacks may exist where explicitly implemented.

## 4. Privileged control plane

```text
[4] AUTH
   │
   └── verified admin scope ──> [8] ADMIN
                                  │
                                  ├── incident actions
                                  └── emergency AI lockdown
```

Admin operations remain isolated from the normal user path and require the application's admin authentication/authorization checks.

## 5. Monitoring / SOAR plane

```text
                 [10] MONITORING / SOAR
                  /        |         \
                 v         v          v
              REDIS    AI RESILIENCE  ADMIN
               state      health      response
```

Monitoring is supervisory. It observes security signals and can trigger bounded defensive responses; it does not become another sequential request-processing layer.

## 6. Why this model is the optimized version

- **Single clear request path:** fewer ambiguous arrows and no accidental dependency on Admin or Redis.
- **Conditional controls:** Challenge and Admin are shown only when their conditions are met.
- **AI resilience is isolated:** provider failures, key rotation, circuit breaking, and recovery stay inside the AI boundary.
- **Response Guard is outbound:** response-size and secret-redaction checks happen before data leaves the gateway.
- **Shared state is explicit:** Redis supports distributed controls without becoming a bottleneck in the conceptual request path.
- **Monitoring is horizontal:** observability and incident response remain separate from request processing.
- **No credentials in the model:** API keys, service-role credentials, Redis tokens, admin passwords, and other secrets must never appear in diagrams or documentation.

## 7. Security model boundaries

This architecture describes defensive controls implemented by the application. It does not claim that the system is invulnerable or that every automated agent can be identified perfectly. Production effectiveness must be measured with bounded, authorized tests and real deployment telemetry.
