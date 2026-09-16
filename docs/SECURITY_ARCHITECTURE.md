# STUDY TH Security Architecture

## Corrected request/response model

The security model has three different planes:

1. **Request path**: the request is validated and routed toward the authorized backend.
2. **Shared state**: Redis provides global state used by multiple controls; it is not a mandatory sequential step for every request.
3. **Control/observability plane**: Admin and Monitoring/SOAR can act on the system when their conditions are met.

### Request path

```text
User / External AI
        |
        v
     [1 EDGE]
        |
        v
    [2 THREAT]
        |
        v
  [3 CHALLENGE]
        |
        v
     [4 AUTH] ----------- (admin scope) ----------> [8 ADMIN]
        |
        v
    [6 GATEWAY]
        |
        v
 [7 AI RESILIENCE]
        |
        +---------------------> [9 DATA]
        |
        +---------------------> [10 RESPONSE GUARD]
                                   |
                                   v
                               [6 GATEWAY]
                                   |
                                   v
                            User / External AI
```

The **AI Resilience** layer is the response origin for AI-backed requests: it receives the result from the model/provider, then the result is sanitized by the Response Guard before being returned through the Gateway to the requester.

### Data and response are parallel outcomes

AI Resilience can both:

- write authorized application/audit state to **Data**, and
- send the generated result to **Response Guard** for sanitization.

The model is therefore **not** `Data -> Response`. The two are parallel branches from the processing point.

```text
                   +--------> DATA
                   |
AI RESILIENCE -----+
                   |
                   +--------> RESPONSE GUARD -> GATEWAY -> USER
```

### Shared Redis state

```text
                     [5 REDIS]
                         ^
                         |
      +------------------+------------------+
      |                  |                  |
    EDGE             THREAT /           CHALLENGE
                       AUTH                 |
      |                  |                  |
      +------------------+------------------+
                         |
                  AI RESILIENCE
                         |
                       ADMIN
```

Redis is used as shared state for controls such as distributed rate limiting, replay protection, temporary challenges/quarantine, sessions, and AI circuit-breaker state. It should not be drawn as a mandatory hop between every layer.

### Monitoring / SOAR is supervisory

Monitoring is a horizontal layer that observes the request path and can trigger bounded defensive actions when policy conditions are met:

```text
                 [10 MONITORING / SOAR]
                  /        |          \
                 /         |           \
                v          v            v
             [REDIS]  [AI RESILIENCE]  [ADMIN]
             block/    revoke/disable  lockdown/
             quarantine     key         incident action

User -> EDGE -> THREAT -> CHALLENGE -> AUTH -> GATEWAY -> AI RESILIENCE -> DATA
                                                                  |
                                                                  v
                                                          RESPONSE GUARD
                                                                  |
                                                                  v
                                                                 USER
```

Monitoring is therefore **not** a sequential stage after Data. It observes the system and may initiate defensive actions at the relevant control layer.

## Rules for future diagrams

- Keep Admin as a conditional privileged branch, not the default request path.
- Draw a complete response path back to the requester.
- Start the response branch at AI Resilience for AI-generated results.
- Draw Data and Response Guard as parallel branches from the processing point.
- Treat Redis as shared state, not a mandatory request hop.
- Draw Monitoring/SOAR as a supervisory layer with explicit action arrows.
- Never place API keys, secrets, service-role credentials, Redis tokens, or admin passwords in diagrams or documentation.
