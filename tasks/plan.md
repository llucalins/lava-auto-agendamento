# Implementation Plan: Car Wash Scheduling MVP

## Objective

Deliver the approved secure MVP: package-first public booking, interval availability and atomic confirmation, status-only public tracking, and protected staff operations. Correctness, privacy, and multi-instance safety are first-class acceptance conditions.

## Sources of Truth

`docs/intent/car-wash-scheduling.md`, `CAPABILITY_MAP.md`, `docs/security/threat-model.md`, every `SPEC-*.md`, `docs/architecture/detailed-architecture.md`, and ADRs `0001`–`0005`. The current architecture resolves package price as non-negative: `price_centavos >= 0`; duration remains positive and bounded.

## Approved Architecture Summary

- TypeScript, Next.js App Router, supported Node LTS, and a modular monolith.
- PostgreSQL is the sole authoritative database; `pg` provides a thin SQL/transaction boundary and `node-pg-migrate` owns forward migrations.
- Zod validates untrusted boundaries; Vitest and Playwright test domain/integration and browser flows.
- PostgreSQL persists/coordinates sessions, authorization versions, idempotency, booking allocations, tracking, and durable audit.
- Managed OIDC/MFA authenticates identity; PostgreSQL local sessions and application-owned authorization remain authoritative.
- Tracking uses an opaque verifier-only credential, body proof, a PostgreSQL tracking session, and a status-only projection.

## Implementation Strategy

Establish minimal supply-chain/config/transaction foundations, then build catalogue and calendar read slices. Prove booking allocation, idempotency, and PostgreSQL concurrency before the public confirmation UI. Establish durable audit before high-impact admin operations. Build OIDC/session/authorization before protected admin slices and the dedicated sensitive disclosure gate. Add tracking independently of booking confirmation, then hardening, retention, observability, and CI incrementally rather than as a final integration phase.

## Dependency Graph

```text
dependency/config + pg/migrations
 ├─ catalogue + calendar ──> booking/capacity/idempotency ──> public booking
 ├─ durable audit ──> auth/session ──> authorization ──> admin operations/disclosure
 └─ booking lifecycle ──> tracking credential/proof/session/status
shared security, observability, retention, and CI attach progressively
```

## Phases

1. Dependency, toolchain, config, PostgreSQL, and audit foundations.
2. Catalogue, calendar, booking integrity, capacity, and idempotency.
3. Public booking vertical flow.
4. OIDC/session/authorization and protected operations.
5. Sensitive disclosure and public tracking.
6. Hardening, resource controls, observability, retention, and CI/review.

## Checkpoints

`tasks/todo.md` includes 15 checkpoints, each after two or three tasks. Evidence evolves from focused tests to PostgreSQL integration/concurrency, browser validation, lint/typecheck/build, security review, and human review.

## Production Gates

CPF purpose, lawful basis, necessity/proportionality, and transparency notice; fiscal requirements; hosting/PostgreSQL/OIDC-MFA providers; DPA/data-location review; first OWNER bootstrap; MFA factor/enrollment/recovery; backup retention; tracking replacement assurance; abuse/security-signal retention; and shared/edge rate-limit provider remain unresolved. They block production configuration or enabling associated jobs—not local core implementation.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Double booking/release error | Native range/exclusion constraints, guarded transaction paths, real concurrent PostgreSQL tests. |
| Confirmation lost response | Idempotency outcome is recovered before newer catalogue/calendar validation. |
| PII disclosure race | Audit-first, final primary-DB current authorization predicate, minimal projection, privilege-reduction race test. |
| Tracking secret leak | Verifier-only storage, neutral URL/body proof, generic responses, no-store and browser checks. |
| PII/secret observability leak | Allowlisted fields, no bodies/headers, synthetic test data, redaction tests. |
| Supply-chain risk | Version/provenance review, one lockfile, fail-closed script policy, frozen CI install/audit. |

## Open Questions

- Confirm only permission granularity for EMPLOYEE assignments (for example cancellation, catalogue/calendar configuration, and sensitive-field grants); OWNER/EMPLOYEE, application-owned permission authorization, default deny, and actor/action/resource/field checks are approved.
- Approve OIDC/MFA, hosting, PostgreSQL, DPA/data location, bootstrap, recovery, and rate-limit enforcement.
- Approve backup, tracking verifier/session, idempotency, and security-signal retention values.
- Complete CPF and fiscal legal/business documentation for production.

## Definition of Done

Each task is independently verified using synthetic data, preserves module/PII boundaries, adds no prohibited browser storage/logging, stays reviewable and atomic, and meets its stated acceptance criteria. The MVP is production-ready only after all checkpoints and all production gates have human approval.
