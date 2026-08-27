# ADR-0006: Admin CSRF policy and MVP permission matrix

## Status

Accepted

## Decision

Authenticated browser ADMIN mutations (POST, PUT, PATCH, DELETE) require a
valid PostgreSQL session, an exact match to the configured canonical Origin,
and a 256-bit-or-stronger PostgreSQL-bound synchronizer token. Missing,
malformed, non-HTTPS production, wildcard, suffix, or cross-origin requests
fail closed. SameSite cookies are defense in depth; GET and HEAD remain
side-effect free and do not require CSRF tokens.

The application uses explicit server-side permissions with deny-by-default.
OWNER has BOOKING_READ, BOOKING_STATUS_UPDATE, BOOKING_CANCEL, PACKAGE_MANAGE,
CALENDAR_MANAGE, PICKUP_ADDRESS_REVEAL, CPF_REVEAL, AUDIT_READ, and
ADMIN_IDENTITY_MANAGE. EMPLOYEE has BOOKING_READ, BOOKING_STATUS_UPDATE,
BOOKING_CANCEL, and PICKUP_ADDRESS_REVEAL only. Unknown roles, permissions,
missing local identities, and client/OIDC-provided roles are denied.

Sensitive-field permissions only permit entry to the separately approved
Task 35 disclosure pipeline; they never disclose PII directly.

## Consequences

CSRF state and authorization state remain PostgreSQL-authoritative and are not
replaced by process memory, Origin-only checks, or provider claims.
