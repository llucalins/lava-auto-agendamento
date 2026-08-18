# ADR-0001: Use a TypeScript Next.js modular monolith

## Status

Accepted

## Context

The MVP has public booking and status-tracking surfaces plus a protected administrative surface. The approved specifications require server-authoritative booking, authorization, privacy, audit, and tracking decisions, but do not justify independent deployable services.

## Decision

Use TypeScript with Next.js App Router on a current supported Node.js LTS release in one logical modular-monolith application deployment.

Organize code by approved capability boundaries. TypeScript strengthens explicit domain and interface contracts, but runtime validation remains mandatory for HTTP input, cookies, headers, URL parameters, database values, identity-provider claims, and every other untrusted boundary. Prefer simple explicit TypeScript; do not add advanced type-level abstractions without demonstrated value.

The runtime dependency directions in the Capability Map remain binding inside the monolith. `privacy-governance` is a cross-cutting policy constraint, not a runtime service or a dependency that ordinary domain modules call.

Correctness, authorization, sessions, booking capacity, idempotency, tracking lifecycle, audit, and durable state must not depend on process-local memory or exactly one application process.

## Consequences

- Public and administrative web interfaces share one server-authoritative application boundary.
- A single deployable reduces operational and security boundaries while allowing capability-level modules.
- Horizontal execution remains possible because correctness state is persisted outside process memory.
- This ADR does not select a validation library, ORM, migration tool, hosting provider, or deployment vendor.

## Alternatives considered

- **Split frontend/backend:** rejected for MVP because it creates separate session, CSRF, deployment, and observability boundaries without an approved requirement.
- **Microservices or distributed/event-driven architecture:** rejected because no approved capability requires independent deployment, a broker, or distributed consistency.

## Security and privacy implications

Server-side execution is required for authoritative business decisions. Runtime validation and explicit output projections remain mandatory; TypeScript types are not a security boundary.

## Open follow-up decisions

Pin the current supported Node.js LTS release, define module layout, and select implementation libraries during detailed architecture.

## References

- [Intent](../../intent/car-wash-scheduling.md)
- [Capability map](../../../CAPABILITY_MAP.md)
- [Threat model](../../security/threat-model.md)
- [Public booking flow](../../../SPEC-public-booking-flow.md)
- [Admin operations](../../../SPEC-admin-operations.md)
