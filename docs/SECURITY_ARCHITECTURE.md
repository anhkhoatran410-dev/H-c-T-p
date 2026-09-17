# STUDY TH Security Architecture

## Current hardened request / response model

The architecture separates the normal request path from shared state and supervisory controls.

```text
                              [10] MONITORING / SOAR
                       observe -> detect -> score -> respond
                         |             |             |
                         v             v             v
                      [5 REDIS]   [7 AI RESILIENCE] [8 ADMIN]
                       block/        key action       lockdown /
                       state         / recovery      incident action

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
    [4] AUTH ------------------- admin scope ------------------> [8] ADMIN
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
 [7] AI RESILIENCE <----- result from external AI / model provider
        |
        +-------------------------------> [9] DATA
        |
        +-------------------------------> [11] RESPONSE GUARD
                                             |
                                             v
                                         [6] GATEWAY
                                             |
                                             v
                                      USER / EXTERNAL AI
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

DLP + Semantic Guardrail is a defense-in-depth ingress layer. DLP conservatively redacts obvious email addresses, Vietnamese phone/ID patterns, JWT-like tokens, common API-key formats, and bearer tokens before provider execution. The semantic guardrail evaluates a bounded multi-turn context and blocks only when at least two independent high-confidence instruction-hijacking/exfiltration signals are present. It is heuristic and does not claim perfect semantic jailbreak detection.

The same ingress layer is used by both the AI solve path and the public support-AI path. The privileged Admin Copilot also applies DLP to the context assembled from Supabase and repository sources before that context is placed in the provider prompt.

Admin is **not** a mandatory step. It is a privileged branch activated only when the authenticated request has the required admin scope.

### 2. Response path

For an AI-backed request, the response starts at the point where **AI Resilience receives the result from the external AI/model provider**:

```text
AI / model provider
        |
        v
[7] AI RESILIENCE
        |
        v
[11] RESPONSE GUARD
        |
        v
[6] GATEWAY
        |
        v
User / External AI
```

Response Guard is therefore part of the outbound response path, not a replacement for AI Resilience or Data.

### 3. Data and response are parallel outcomes

AI Resilience can produce two independent outcomes at the same processing point:

```text
                     [7] AI RESILIENCE
                       /             \
                      v               v
                  [9] DATA      [11] RESPONSE GUARD
                                     |
                                     v
                                 [6] GATEWAY
                                     |
                                     v
                               User / External AI
```

The model must **not** imply `AI Resilience -> Data -> Response`. Data persistence/logging and response delivery are separate branches.

### 4. Redis is shared state, not a mandatory hop

```text
                    [5] REDIS
                 shared state
                       ^
          +------------+-------------+
          |            |             |
        EDGE        THREAT /      CHALLENGE
                      AUTH
          |            |             |
          +------------+-------------+
                       |
               AI RESILIENCE
                       |
                     ADMIN
```

Redis may support distributed rate limiting, replay protection, challenge/quarantine state, sessions, and AI circuit-breaker state. A normal request does not have to be drawn as `Auth -> Redis -> Admin`.

### 5. Monitoring / SOAR is supervisory

Monitoring observes the pipeline rather than becoming a final sequential step:

```text
                  [10] MONITORING / SOAR
                    /        |        \
                   v         v         v
               [5 REDIS] [7 AI RESILIENCE] [8 ADMIN]
                block/     key action       lockdown /
              quarantine   / recovery      incident action
```

This makes the auto-response destinations explicit without implying that Monitoring itself processes the request in sequence.

### 6. Enterprise roadmap boundaries

The following are **not enabled by this repository patch** and must not be described as current production capabilities:

- Cloudflare Enterprise WAF / advanced bot management in front of Vercel.
- Native Android/iOS attestation such as Play Integrity or Apple App Attest.
- Google Cloud Private Service Connect / VPC-only provider connectivity from the hosting environment.

Those require separate platform/account/network configuration. For the current web application, the repository implements the web-compatible DLP and semantic guardrail layer without claiming those external services are installed.

## Final rules for diagrams

- Admin is a conditional privileged branch, never the default request path.
- AI Input Guard is between the public Gateway and provider processing; it does not replace Threat, Auth, Gateway, or Resilience.
- DLP + Semantic Guardrail is a defense-in-depth ingress layer and remains heuristic.
- Response begins from the AI processing/result point and returns through Response Guard -> Gateway -> requester.
- Data and Response Guard are parallel outcomes from AI Resilience.
- Redis is shared state, not a mandatory sequential request hop.
- Monitoring/SOAR is a horizontal supervisory layer with explicit bounded defensive actions.
- Never place API keys, secrets, service-role credentials, Redis tokens, admin passwords, or other credentials in diagrams or documentation.
