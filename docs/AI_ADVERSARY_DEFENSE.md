# STUDY TH — AI Adversary Defense

## Purpose

This layer is designed for automated or AI-assisted abuse, including coordinated botnets, agentic clients, scrapers, replay automation, and prompt-driven attack tools.

The system does **not** try to identify a client as an "AI" from a User-Agent alone. It evaluates behavior and server-side signals instead.

## Defense model

`Edge/WAF -> Intrusion Shield -> Behavior Defense -> Replay/HMAC -> Distributed Rate Limit -> Bounded Proof-of-Work -> AI Gateway -> Global Circuit Breaker -> Dynamic Key Pool -> AI Provider`

## Bounded computational toll

When a source accumulates enough suspicious behavior, the gateway can require a SHA-256 proof-of-work challenge. The work is intentionally bounded by a small maximum difficulty and applies only to the suspicious requester.

The goal is to make automated abuse economically unattractive without intentionally overheating, damaging, or exhausting another person's device.

A successful proof is single-use and time-limited. Failed or expired proofs do not grant access.

## AI-agent / swarm resistance

Signals include:

- repeated bursts against protected routes;
- missing or inconsistent browser-origin signals;
- repeated policy violations;
- replay attempts;
- repeated invalid internal authentication;
- coordinated request patterns recorded in Redis;
- repeated failures against protected AI endpoints.

The system should not rely on one signal. AI agents can imitate browser headers, so behavior is weighted more heavily than identity claims.

## Escalation

Normal request -> allow.

Suspicious request -> rate limiting and/or challenge.

Repeated violations -> higher challenge cost and cooldown.

Persistent abuse -> Redis-backed quarantine with TTL.

AI provider abuse -> Circuit Breaker isolates unhealthy keys and Dynamic Key Pool rotates to healthy keys.

## Non-retaliation boundary

The defense system never sends exploit code, malware, destructive traffic, or resource-exhaustion traffic back to the requester. It contains the abuse by denying capability and transferring a bounded verification cost to the abusive request.

## Operational requirements

Configure these variables on Vercel for global state:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `INTERNAL_GATEWAY_SECRET`

Keep provider keys server-side only.
