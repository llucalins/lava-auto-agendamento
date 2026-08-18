# ADR-0004: Use proof-to-session status-only public tracking

## Status

Accepted

## Context

Customers need unauthenticated status checking without customer accounts, public booking readers, PII-based recovery, or reusable bearer secrets in normal URLs. Tracking grants only a status-minimum projection.

## Decision

Use a separate opaque, high-entropy, non-enumerable tracking credential that is independent of `bookingId` and all customer data. Store only a verifier/digest at rest; never retain the raw credential merely for lookup or recovery.

The customer reaches a neutral secret-free tracking URL and submits the raw credential only in an HTTPS request body. After server verification, establish a short-lived server-controlled tracking session. A Secure, HttpOnly cookie carries only an opaque tracking-session identifier. Every status read validates both the session and current credential lifecycle, then returns exactly the authoritative booking status.

At most one credential is active per booking. Revocation, replacement, expiry, or credential-version invalidation must immediately invalidate associated tracking sessions or make them fail current lifecycle checks.

## Lifecycle and delivery consequences

- A credential remains operational during `SCHEDULED`/`IN_PROGRESS` unless invalidated.
- It expires seven days after the authoritative `COMPLETED` or `CANCELLED` transition; expiry does not delete the booking or alter PII retention.
- Booking confirmation and credential delivery are separate effects. Booking remains valid if credential issuance/delivery fails.
- The raw credential is shown only in the original private/no-store delivery response. If an active verifier exists but that raw-secret delivery was lost, the raw credential cannot be reconstructed. Refresh or ambiguous retry must not automatically issue another credential.
- This is a known safe failure state: public recovery using CPF, contact data, name, licence plate, or `bookingId` is prohibited. The only future resolution is an explicitly approved, authorized administrative replacement workflow; it must preserve the one-active-credential rule and durable-audit requirements.

## Security and privacy implications

Tracking proof and status routes require private/no-store behavior and no third-party browser resources by default. Raw credentials and status-sensitive data must not enter URLs, referrers, browser history, edge/CDN/proxy logs, analytics, APM, telemetry, errors, audit payloads, or durable browser storage.

## Alternatives considered

- **`bookingId` or PII as access proof:** rejected because neither is an authorization credential.
- **Long-lived credential in steady-state URL:** rejected because copying, history, referrer, cache, and infrastructure logs create unnecessary bearer-secret exposure.
- **Raw credential storage for redelivery:** rejected because it expands secret-at-rest risk.

## Open follow-up decisions

Define encoding/entropy parameters, verifier/key lifecycle, tracking-session duration/cookie policy, rate-limit signals, cache/header syntax, and future administrative replacement assurance.

## References

- [Public status tracking](../../../SPEC-public-status-tracking.md)
- [Public booking flow](../../../SPEC-public-booking-flow.md)
- [Booking lifecycle](../../../SPEC-booking-lifecycle.md)
- [Privacy governance](../../../SPEC-privacy-governance.md)
