# STUDY TH — Enterprise Security Roadmap

This document distinguishes code-level controls from provider/infrastructure controls that require separate platform configuration.

## Code-level controls in this patch

- Redis-backed allowlist for trusted IP/device subjects, using one-way fingerprints only.
- Admin RBAC tiers: Operator (read-only), SecOps (quarantine), CISO (global AI lockdown).
- High-impact CISO actions require a second approval credential before the change is accepted.
- Audit records continue to avoid raw AI responses and secret material.
- Security checks remain enforced in CI.

## Infrastructure controls that are not created by source code alone

- Redis Cluster / Multi-AZ automatic failover. The application can be made failover-aware, but cluster topology and replica promotion must be configured in the Redis provider.
- Supabase read replicas / database failover. These require provider-level replication and connection configuration.
- HSM / AWS Secrets Manager / Azure Key Vault / HashiCorp Vault. A secret-provider integration can be enabled separately; source code must not contain provider credentials.
- Terraform / Pulumi for Vercel, Redis and Supabase. Infrastructure-as-code should be introduced only after the target provider accounts, regions and networking are fixed.

## Security principle

Never claim an infrastructure control is active merely because application code is prepared to use it. Runtime/provider configuration must be verified separately.
