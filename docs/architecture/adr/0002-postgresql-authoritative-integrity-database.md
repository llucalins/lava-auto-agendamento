# ADR-0002: Use PostgreSQL as the authoritative integrity database

## Status

Accepted

## Context

Booking confirmation, interval capacity, revisions, idempotency, sessions, tracking lifecycle, and durable audit require recoverable multi-instance consistency. The MVP needs initial configurable capacity `N = 1` without fixed slots and must preserve a path to later `N > 1` or resource allocation.

## Decision

Use PostgreSQL as the sole authoritative application and integrity database. It persists and coordinates booking integrity/capacity, persisted revisions, confirmation idempotency, admin sessions/revocation, authorization-relevant state, tracking verifiers/sessions/lifecycle, and durable audit.

Keep a thin persistence boundary. Parameterized database-native SQL remains available for integrity-critical transactions, constraints, locks, ranges, and isolation; an abstraction must not block those features.

Authoritative BRL amounts use bounded integer centavos with a fixed `BRL` invariant. No binary floating point is allowed. JSON/client boundaries must not silently lose JavaScript integer precision.

## Capacity and lifecycle consequences

- Service intervals are half-open `[start, end)`; back-to-back bookings are valid and fixed slots are not used.
- An initial active capacity unit represents configurable `N = 1`; active capacity allocations cannot overlap.
- Allocation records carry authoritative capacity-consuming state and are transactionally coupled to booking status.
- `SCHEDULED` and `IN_PROGRESS` retain/consume their allocation. `CANCELLED` releases capacity exactly once only after committed cancellation. Requested, failed, rejected, or ambiguous cancellation does not release capacity. `COMPLETED` preserves historical allocation and is not cancellation; its elapsed interval does not consume future capacity.
- Historical allocation information is not deleted merely to release capacity.
- Later `N > 1` or resource allocation must retain the same booking-interval semantics. Detailed architecture must atomically select an eligible unit, coordinate contenders, avoid over-capacity and false unavailability, and distinguish transient races from genuine unavailability.

## Confirmation and idempotency consequences

For a new intent, one recoverable transaction/equivalent consistency boundary revalidates current package/calendar revisions, authoritative terms, interval, capacity allocation, immutable snapshot, initial `SCHEDULED` booking, and idempotency outcome.

The stored outcome is resolved before newer terms are revalidated: the same intent with the same canonical material request returns the original committed outcome; the same intent with a different material request conflicts; a new intent receives new authoritative validation.

## Alternatives considered

- **Process-local state or a single-instance assumption:** rejected because restart and multi-instance operation must preserve correctness.
- **Redis/distributed locks as booking correctness boundary:** rejected; PostgreSQL is the authoritative transaction and constraint boundary.
- **Multiple application databases:** rejected because it adds consistency and privacy duplication without an approved need.

## Security and privacy implications

Database roles must distinguish migration, runtime, backup/restore, and audit permissions. Runtime access must remain parameterized and least-privileged. This ADR does not select an ORM, query builder, migration tool, or PostgreSQL provider.

## Open follow-up decisions

Detailed architecture must define schema, migrations, exact constraints/indexes, allocation-unit selection, retry bounds, connection management, and backup/restore operations.

## References

- [Booking lifecycle](../../../SPEC-booking-lifecycle.md)
- [Operating calendar](../../../SPEC-operating-calendar.md)
- [Service catalog](../../../SPEC-service-catalog.md)
- [Audit trail](../../../SPEC-audit-trail.md)
