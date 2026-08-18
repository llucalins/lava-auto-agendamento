# Spec: booking-lifecycle

## Status

Draft for human review. This is the Phase 1 specification for `booking-lifecycle` only. It does not authorize planning, implementation, or specification of `public-booking-flow`, `public-status-tracking`, `admin-operations`, or another module.

## Objective

Define the authoritative booking aggregate, its lifecycle, and the integrity invariants required to create and manage a booking safely. At confirmation it combines authoritative package terms from `service-catalog`, authoritative calendar eligibility from `operating-calendar`, current booking/resource usage, and a future capacity/resource policy.

`booking-lifecycle` depends on `service-catalog` and `operating-calendar`, complies with `privacy-governance`, and preserves the approved `audit-trail` relationship. It owns booking domain integrity; later modules own public UX/tracking credentials and protected administrative orchestration.

## Scope

This specification defines:

- Booking identity, required/conditional customer and vehicle data, package snapshot, service interval, statuses, confirmation, cancellation, and mutation/concurrency invariants.
- Server-authoritative package/calendar/capacity validation, atomic confirmation, double-booking prevention, retry safety, privacy, audit, and error requirements.
- Boundaries with public booking, public tracking, and future administrative operations.

## Non-goals

- Public customer authentication, customer UI, public tracking-token design, general public booking reader, notification delivery, or administrative authorization implementation.
- Fixed slot generation, a one-vehicle assumption, fixed staff/bay count, fixed slot increments, or a final capacity model.
- Payment processing, refunds, payment provider selection, routing/geocoding, pickup-zone logic, or online payment credentials.
- Choosing a framework, database, ORM, transaction/locking/queue/cache mechanism, capacity model, session/auth technology, HTTP transport, cloud provider, payment provider, or public tracking-token mechanism.

## Proposed booking aggregate/domain model

| Field/concept | Requirement |
|---|---|
| `bookingId` | Stable internal booking identifier. It is not a secret, does not grant authorization by possession, and is distinct from any future public-status credential/token. |
| `bookingRevision` | Server-controlled aggregate revision or equivalent concurrency concept for detecting stale status/administrative mutations. Representation is deferred. |
| customer information | Full name, phone/WhatsApp, CPF, and optional email, subject to `privacy-governance`. |
| vehicle information | Vehicle model, licence plate, and colour. |
| `serviceMode` | `DROP_OFF` or `PICKUP_REQUESTED`. |
| pickup address | Required only for `PICKUP_REQUESTED`; absent/not retained for `DROP_OFF`. |
| intended payment method | Operational payment intention only; authoritative MVP allowlist is `PIX`, `CASH`, `CREDIT_CARD`, and `DEBIT_CARD`. It is not proof that payment occurred. |
| package snapshot | Immutable confirmed package contract defined below. |
| service interval | One coherent authoritative `[start, end)` interval in the business timezone. |
| status | `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, or `CANCELLED`. |

The aggregate must not contain card credentials, CVV, bank credentials, PIX secrets, payment-provider credentials, payment tokens, public tracking tokens, or unrelated PII.

## Customer, vehicle, pickup, and payment-intention data

- Current confirmed MVP booking data is full name, phone/WhatsApp, CPF, optional email, vehicle model, licence plate, and vehicle colour.
- CPF remains a confirmed MVP business requirement. Official-source verification did not establish a universal Brazilian legal/fiscal need to collect CPF at booking; it is ordinary personal data under LGPD and an internal high-risk PII classification, not statutory sensitive personal data. Before production CPF storage is finalized, the controller must document concrete purpose, lawful basis, necessity/proportionality, and transparency obligations. This specification does not presume consent, contract necessity, legal obligation, or legitimate interest without concrete supporting business context, and does not silently remove CPF.
- `DROP_OFF` requires no pickup address; unnecessary pickup-address data must not be retained.
- `PICKUP_REQUESTED` requires a valid pickup address before confirmation.
- This module does not add geocoding, maps, routing, distance pricing, pickup zones, or other pickup logic.
- Intended payment method records only customer intent; it is not proof of payment and does not initiate a payment. The server validates only `PIX`, `CASH`, `CREDIT_CARD`, or `DEBIT_CARD` and rejects arbitrary free-form values. The system does not process online payments, integrate a payment gateway, or collect/store card number, CVV, banking credentials, PIX secrets/tokens, or payment credentials.

## Authoritative package terms and immutable confirmed snapshot

- During confirmation, the server resolves the authoritative current `service-catalog` package.
- The client cannot set authoritative price, currency, duration, package status, package revision, or confirmed package snapshot.
- A successful confirmation preserves the immutable booking-facing package contract: `packageId`, `packageRevision`, customer-facing package name, customer-facing description, confirmed price, confirmed currency, and confirmed estimated duration.
- MVP currency is `BRL`. Confirmed monetary values use exact monetary semantics; binary floating-point must not be authoritative or used for commercially significant calculations. Representation is deferred.
- Later catalogue changes must never silently rewrite the confirmed snapshot.

## Stale commercial terms and calendar selection

- If price, currency, estimated duration, activation state, or commercially relevant name/description changes after customer review but before confirmation, the booking must not silently confirm using different terms.
- The server detects stale reviewed terms using a future mechanism, resolves the current authoritative package itself, and requires the customer to review current terms again.
- If the package is inactive, confirmation fails safely. If duration changed, calendar and final availability are revalidated using the current authoritative duration.
- A previously displayed date/time is advisory only, not a reservation or guarantee. At confirmation the server revalidates against one coherent current authoritative operating-calendar state.
- A stale or no-longer-calendar-eligible selection fails safely and requires a new selection/review. Client-cached calendar data/revisions cannot override server state.

## Service interval and calendar authority

- Confirmation produces one coherent authoritative service interval based on selected start time, authoritative package duration, authoritative business timezone, and operating-calendar rules.
- Intervals use approved half-open semantics `[start, end)`. The client must not supply or calculate an authoritative end time or duration.
- The complete required interval must fit in one calendar-eligible resulting operating window and not intersect a closure/unavailability block.
- Timestamp representation is deferred.

## Availability and capacity abstraction

- Calendar eligibility is necessary but not sufficient for final bookability.
- The initial authoritative MVP capacity policy is `N = 1`: at most one vehicle may occupy an authoritative service interval at any instant after considering existing confirmed/in-progress bookings. It is not one booking per fixed time slot, one washing bay, a fixed slot increment, or an architectural hard-coded constant.
- Availability continues to combine authoritative package duration, operating-calendar eligibility, existing service intervals, and capacity. Under approved half-open `[start, end)` intervals, back-to-back bookings are valid when one interval ends exactly as another begins.
- The capacity/resource abstraction remains extensible: a later approved change to `N > 1` or resource-based capacity must not require redefining booking semantics.
- `booking-lifecycle` must enforce the same confirmation invariant regardless of the eventual allowed capacity `N`.

## Booking creation and atomic confirmation invariant

- Availability shown before confirmation is advisory only.
- At the authoritative confirmation boundary, the system must atomically or equivalently coordinate: current authoritative package validation; stale-commercial-term validation; current authoritative calendar validation; authoritative duration; current overlapping booking/resource usage; current capacity/resource policy; creation of the confirmed booking; immutable package snapshot; and initial `SCHEDULED` status.
- Concurrent confirmation requests must never result in accepted bookings exceeding the authoritative capacity/resource rule for relevant service intervals. If the future policy permits `N` concurrent services, no concurrency/failure path may yield more than `N` successful consuming bookings.
- A booking must not be externally reported as confirmed unless all confirmation invariants succeed. Failure must not leave a customer-visible confirmed booking with missing snapshot, invalid calendar eligibility, unaccounted capacity, incomplete customer data, or inconsistent pickup data.
- The package state/revision, calendar state/revision, capacity/resource decision, service interval, booking creation, package snapshot, and initial status used by one successful confirmation form one coherent authoritative confirmation outcome.
- The implementation must not combine package terms from different revisions, calendar rules from different revisions, or a capacity decision that became invalid before the confirmation effect was accepted. Concurrent changes require safe retry/revalidation or another proven consistency outcome, never silent mixed state.
- Once successfully confirmed, later catalogue/calendar changes do not invalidate or rewrite the booking.
- The eventual architecture must prove this invariant under concurrency, crash, timeout, retry, and recovery paths. Transaction, locking, isolation, reservation, queue, semaphore, and persistence mechanisms remain deferred.

## Retry, duplicate submission, and idempotency

- Booking confirmation must be retry-safe for browser retries, double-clicks, network timeouts, client retries, and replay of the same intended confirmation.
- The eventual architecture requires an idempotency/deduplication contract that binds one confirmation intent to one canonical/material confirmation request. Its key/intent representation, transport, expiration, and persistence mechanism are deferred.
- Retrying the same intent with materially equivalent confirmation data returns or recoverably identifies the same outcome. If that intent produced a confirmed booking, later retries return the original confirmed result and must not create another booking or consume capacity again.
- Later catalogue/calendar changes must not retroactively reprice, reschedule, or invalidate a booking already accepted for an identical retry.
- Reusing an intent identifier with materially different booking data fails as an idempotency conflict; it must not silently modify the existing booking or create a new booking. A genuinely new customer confirmation attempt uses a distinct intent and undergoes current authoritative package, calendar, and capacity validation.
- Timeout/crash recovery must first determine the authoritative outcome of the original intent before attempting a second booking effect.
- Idempotency is part of the confirmation consistency boundary. No failure path may yield one intent with multiple confirmed bookings, one confirmed booking consuming capacity multiple times, an idempotency outcome claiming confirmation without a successful booking effect, or a confirmed booking whose accepted idempotency outcome incorrectly reports permanent failure.
- The eventual architecture must define a recoverable consistency strategy for these states without choosing its mechanism here.

## Status machine and mutation concurrency

The approved normal MVP transition model is:

| From | Allowed proposed transition | Notes |
|---|---|---|
| `SCHEDULED` | `IN_PROGRESS` | Service begins. |
| `SCHEDULED` | `CANCELLED` | Authoritative successful cancellation. |
| `IN_PROGRESS` | `COMPLETED` | Service completes. |
| `COMPLETED` | — | Terminal by default. |
| `CANCELLED` | — | Terminal by default. |

- A successful new booking starts as `SCHEDULED`.
- `IN_PROGRESS → CANCELLED` is not a normal MVP transition. Reopening terminal statuses, backward transitions, and correction of an incorrectly applied terminal/status transition require a separately specified, explicitly authorized future correction workflow. Ordinary status transitions must not be used as an implicit correction mechanism.
- Invalid or stale transitions fail server-side.
- Every accepted aggregate mutation that changes authoritative booking state advances or otherwise changes `bookingRevision` or equivalent concurrency state. At minimum this includes approved status transitions, cancellation, and future explicitly approved booking modifications.
- Concurrent administrative status/mutation changes must not silently overwrite each other or create impossible transitions. Stale mutation requests must be rejected or safely reconciled; revision representation and mechanism are deferred.

## Cancellation and future modification/rescheduling boundaries

- Cancellation preserves the booking record/history and immutable package snapshot; it never hard-deletes the booking.
- A `SCHEDULED` booking consumes whatever capacity/resource allocation the future authoritative capacity policy assigns to its service interval.
- After cancellation is authoritatively and successfully committed, that booking no longer consumes future bookable capacity according to that policy. Capacity must not be released merely because cancellation was requested.
- If cancellation fails, including failure of required durable-audit consistency, the booking remains `SCHEDULED` and continues to consume capacity.
- Concurrent cancellation and new confirmation must not create over-capacity or contradictory outcomes.
- Administrative cancellation is later authorized by `admin-operations`/`admin-access` and requires durable audit confirmation.
- Changing a confirmed booking's package, price, duration, start time, pickup mode, or pickup address requires an explicit later-approved modification/rescheduling workflow with complete revalidation as appropriate.
- Catalogue/calendar changes are never implicit booking edits. A future modification affecting package/schedule terms must establish a new coherent approved state rather than partially rewriting the historic confirmation.

## Module boundaries

### `public-booking-flow`

- Later owns availability presentation, input collection, review UI, stale-term response UX, final customer confirmation, and customer-facing validation/errors.
- May call `booking-lifecycle` commands but cannot override authoritative package, calendar, capacity, snapshot, privacy, or concurrency invariants.

### `public-status-tracking`

- Later owns the secure external tracking credential and status-minimum public projection.
- `booking-lifecycle` may provide an internal authoritative status source but exposes no unauthenticated general booking reader.
- Possession of `bookingId` alone must never permit public access.

### `admin-operations` and `admin-access`

- Later own protected administrative mutation orchestration and authorization. `booking-lifecycle` defines state/integrity invariants, not administrative authentication or UI.

## Privacy and minimization

- Apply `SPEC-privacy-governance.md`: collect/store PII only for stated booking/service purposes, require explicit field projections for future consumers, and avoid duplication into unrelated modules.
- Pickup address exists only for pickup bookings; email remains optional.
- Retain PII for `SCHEDULED`/`IN_PROGRESS` bookings only as required to deliver the service. Retain operational PII for `COMPLETED`/`CANCELLED` bookings for 12 months after the terminal transition, then delete or irreversibly anonymize PII with no separate valid retention purpose.
- Fiscal documents/data with a separate legal retention obligation have a distinct purpose and lifecycle; retain only the fields actually required for that obligation and do not preserve complete operational booking PII merely because a fiscal period is longer. Exact fiscal retention remains subject to applicable official requirements.
- No customer PII is allowed in logs, telemetry, analytics, error details, or audit events. General public projections and `public-status-tracking` must not expose booking PII.
- A later `public-booking-flow` specification may define a minimal customer-facing confirmation response within the booking interaction, subject to `privacy-governance` and without creating a general public lookup capability. This specification does not design that response.
- Production PII must not be copied to local development, test, demo, CI, or staging by default. Tests/demos use synthetic data; exceptions follow the approved governance process.
- This approved operational retention policy does not assert a fiscal/legal retention duration; its separate applicability must be verified before it is relied upon.

## Audit classification and boundary

- This module preserves the approved dependency relationship with `audit-trail`; it must comply with the audit contract without moving public tracking-token concerns into audit or booking identity.
- Booking cancellation and status changes require durable audit confirmation when later orchestrated through administrative flows.
- Sensitive CPF/pickup-address reads require durable audit acceptance before disclosure when performed through later administrative flows.
- Minimized audit events must never contain raw booking/customer payloads, CPF, address, tracking tokens, credentials, or complete records.
- Normal successful public booking creation does not require durable security-audit confirmation by default. The authoritative confirmed booking record is the primary business record of creation, and public availability/booking must not become unavailable merely because security-audit persistence is degraded.
- Security-relevant abuse, suspicious attempts, or protection-triggered events may emit minimized audit/security signals according to the approved audit contract; those signals contain no raw booking/customer PII. A later threat-model/specification change may strengthen this classification if justified.
- This decision applies only to normal public booking creation. Administrative cancellation, administrative status changes, privilege operations, and sensitive PII reads retain their approved durable-audit requirements.

## Error behavior

- Domain failures must be safe and actionable without exposing internal IDs unnecessarily, stack traces, persistence details, capacity internals, other customers' bookings, PII, audit internals, or security configuration.
- The transport-independent contract must distinguish where useful: invalid input; stale commercial terms; no-longer-eligible calendar selection; capacity unavailable; duplicate/retry result; and invalid/stale status transition.
- Transport mappings, including HTTP status codes, are deferred to a later interface specification.

## Implementation gates

Authoritative booking-confirmation implementation must preserve the approved configuration: `America/Fortaleza` is the business timezone; initial capacity is `N = 1` without hard-coding that abstraction; and intended payment methods are the approved allowlist. Before production CPF storage is finalized, the controller must complete the approved CPF documentation gate for concrete purpose, lawful basis, necessity/proportionality, and transparency obligations.

## Technology, commands, project structure, code style, and testing

- **Tech stack:** Deferred. No framework, database, ORM, transaction/locking/queue/cache mechanism, capacity model, session/auth technology, HTTP framework, cloud provider, payment provider, or public tracking-token mechanism is selected.
- **Commands:** Not applicable. This specification defines domain invariants and creates no executable artifact.
- **Project structure:** Deferred. No implementation layout is selected.
- **Code style:** Not applicable. No application code or interface binding is selected.
- **Testing and verification expectations:** Future implementation must verify authoritative package resolution; stale price/duration/name/description behavior; inactive-package rejection; immutable snapshot; exact BRL monetary handling; conditional pickup address; optional email; allowlisted intended-payment methods without payment processing/credentials; calendar revalidation in `America/Fortaleza`; `[start, end)` boundaries; initial `N = 1` enforcement, valid back-to-back intervals, and capacity abstraction extensibility; double-booking prevention; retry/idempotency; partial-failure recovery/no partial confirmation; allowed/denied status transitions; stale concurrent status mutations; cancellation preservation; approved terminal PII retention/anonymization and separate fiscal purpose; PII/log/audit restrictions; durable-audit failure behavior; and synthetic-data-only non-production testing.

## Acceptance criteria

- [ ] A booking has stable non-secret/non-authorizing `bookingId`, server-controlled revision concept, required/conditional customer/vehicle/service-mode data, immutable package snapshot, service interval, and approved status set.
- [ ] `DROP_OFF` retains no unnecessary pickup address; `PICKUP_REQUESTED` cannot confirm without valid pickup address; no payment credential/secrets are stored.
- [ ] Server authority prevents client override of package price, currency, duration, status, revision, or snapshot; confirmed package data is immutable and uses exact BRL monetary semantics.
- [ ] Stale commercial terms require renewed customer review; inactive packages fail safely; changed duration triggers current calendar/final-availability revalidation.
- [ ] Confirmation derives one coherent authoritative `[start, end)` interval and revalidates current operating-calendar eligibility.
- [ ] Atomic/equivalent confirmation coordinates package, calendar, capacity/resource usage, snapshot, data completeness, and initial status; it never exceeds capacity `N` under concurrency and failure.
- [ ] Retry/deduplication behavior binds each intent to one canonical/material request, prevents duplicate confirmed bookings/capacity consumption, rejects material intent reuse conflicts, preserves accepted retry outcomes across later catalogue/calendar changes, and has recoverable timeout/crash consistency behavior.
- [ ] The approved normal MVP status transition model is enforced server-side; `IN_PROGRESS → CANCELLED`, terminal reopening, backward transitions, and correction are excluded absent a separate authorized workflow; stale/concurrent mutations cannot cause impossible transitions or silent lost updates.
- [ ] Cancellation preserves history/snapshot and confirmed booking modifications require a separate revalidated workflow.
- [ ] A successful scheduled cancellation releases future bookable capacity only after authoritative commitment; failed/requested cancellation retains capacity, and cancellation/new-confirmation concurrency cannot cause contradictory or over-capacity outcomes.
- [ ] PII is minimized, field-projected, excluded from logs/telemetry/audit and general public/status-tracking projections, and excluded from non-production by default; terminal operational PII follows the approved 12-month policy and fiscal retention is separate/minimized; a minimal in-interaction customer confirmation response remains available for future public-booking-flow specification; CPF production storage remains subject to its approved documentation gate.
- [ ] Cancellation/status/sensitive-read audit handling follows `SPEC-audit-trail.md`; normal public booking creation does not require durable audit confirmation by default, while abuse/security signals remain minimized.
- [ ] Successful confirmation uses one coherent authoritative package/calendar/capacity/interval/snapshot/status outcome with no mixed revision state, and later catalogue/calendar changes do not invalidate/rewrite it.
- [ ] Implementation preserves `America/Fortaleza`, initial `N = 1` capacity without fixed slots/hard-coded semantics, and the approved payment allowlist; CPF production storage requires its approved concrete purpose/lawful-basis/necessity/transparency documentation gate.
- [ ] No public general booking reader, tracking credential, fixed slot algorithm, capacity assumption, or technology choice is introduced.

## Boundaries

### Always

- Resolve package, duration, calendar state, interval, booking/resource usage, and capacity policy server-side at confirmation.
- Preserve immutable confirmed package data and booking history; use exact BRL monetary semantics.
- Revalidate stale commercial/calendar selections and enforce atomic/equivalent capacity-safe confirmation.
- Make confirmation retry-safe, bind each intent to one canonical/material request, and prevent duplicate capacity consumption or contradictory intent outcomes.
- Apply PII minimization, conditional pickup address, payment-intention-only rules, and synthetic data outside production.
- Enforce approved normal status transitions, booking concurrency, cancellation-capacity, and approved audit requirements.
- Preserve `America/Fortaleza`, the initial `N = 1` capacity policy without fixed slots/hard-coded semantics, and the approved payment allowlist; finalize production CPF storage only after its approved documentation gate.

### Ask First

- Defining modification/rescheduling workflows, fiscal retention requirements, or field projections beyond approved privacy rules.
- Changing the initial capacity policy or choosing a later capacity/resource policy; choosing revision/idempotency/transaction/locking/queue/cache mechanism, framework, database, ORM, cloud, payment provider, or tracking-token mechanism.

### Never

- Treat `bookingId` as a secret, authorization capability, or public tracking credential.
- Trust client-submitted package terms, duration, end time, calendar eligibility, capacity, revision, snapshot, or displayed price as authoritative.
- Confirm partially, exceed capacity, silently create a duplicate, or silently rewrite confirmed package/booking terms.
- Reuse one confirmation intent with materially different data, release capacity on a mere cancellation request, or use ordinary status transitions as an implicit correction workflow.
- Store payment credentials, card data, CVV, bank credentials, PIX secrets, provider credentials, payment tokens, or unnecessary pickup address.
- Expose booking PII/general booking records publicly, place PII/tokens/credentials in logs/telemetry/audit, or copy production PII to non-production by default.
- Choose technology or implement public booking/tracking/admin workflow under this specification.

## Open questions requiring human approval

1. What modification/rescheduling workflow applies to confirmed bookings?
2. What exact fiscal retention requirements and minimum fiscal fields apply separately from the approved 12-month terminal operational-PII period?
3. What concrete CPF purpose, lawful basis, necessity/proportionality rationale, and transparency obligations must be documented before production CPF storage is finalized?
4. What later capacity/resource policy applies if the approved initial `N = 1` policy changes?
