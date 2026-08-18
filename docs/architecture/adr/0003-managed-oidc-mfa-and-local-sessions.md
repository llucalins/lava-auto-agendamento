# ADR-0003: Use managed OIDC MFA with local PostgreSQL sessions and authorization

## Status

Accepted

## Context

Every administrative account requires MFA, while authorization must remain server-side, default-deny, actor/action/resource/field aware, and auditable. Identity authentication must not become application permission authority.

## Decision

Use a managed standards-based OIDC identity provider for identity authentication and mandatory MFA. Use PostgreSQL-backed application sessions and retain application-owned staff mapping, OWNER/EMPLOYEE relationship, permissions, field authorization, sensitive-field authorization, and audit policy.

An application session uses an opaque cryptographically random identifier in a Secure, HttpOnly cookie with a deliberate SameSite policy and a server-side PostgreSQL verifier/record. Sessions are restart-safe and multi-instance-safe, have finite idle and absolute lifetimes, rotate as required, and revoke on logout, account disablement, privilege reduction, recovery, and security events.

After a validated MFA authentication, record local assurance context sufficient for authentication time, MFA assurance, assurance expiry, reauthentication, and future step-up. If required assurance cannot be established, fail closed. Every protected request evaluates current server-authoritative authorization; an external OIDC token is not perpetual application authorization proof. Cookie-authenticated state changes require CSRF protection.

## Consequences

- The provider owns identity authentication and MFA; the application owns all authorization and audit decisions.
- Provider, claim mapping, cookie settings, MFA factor/enrollment/recovery policy, session durations, and CSRF mechanism remain detailed or production decisions.
- No specific OIDC/MFA vendor is selected by this ADR.

## Alternatives considered

- **Provider-owned application roles/authorization:** rejected because approved authorization requires local actor/action/resource/field and sensitive-field decisions.
- **Process-memory or stateless application sessions:** rejected because revocation and multi-instance correctness require durable current state.
- **Shared administrative accounts or optional MFA:** rejected by approved security requirements.

## Security and privacy implications

Sessions and credentials remain absent from URLs, logs, telemetry, analytics, and durable browser storage. MFA assurance and session revocation are current server-side state, not assumptions derived solely from long-lived browser tokens.

## Open follow-up decisions

Select and verify an OIDC/MFA provider; define assurance claim mapping, bootstrap, enrollment/recovery, step-up rules, session durations, cookie policy, and CSRF design.

## References

- [Admin access](../../../SPEC-admin-access.md)
- [Admin operations](../../../SPEC-admin-operations.md)
- [Audit trail](../../../SPEC-audit-trail.md)
- [Privacy governance](../../../SPEC-privacy-governance.md)
