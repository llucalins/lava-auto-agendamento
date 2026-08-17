# Spec: public-booking-flow

## Status

Draft for human review. This is the Phase 1 specification for `public-booking-flow` only. It does not authorize planning, implementation, or specification of `public-status-tracking`, `admin-operations`, or another module.

## Objective

Define the unauthenticated customer-facing orchestration for discovering advisory availability, entering approved booking data, reviewing authoritative terms, and explicitly requesting final booking confirmation. It improves usability and safety at the public boundary but is never authoritative for package, calendar, capacity, status-transition, or booking-integrity decisions.

## Scope

This specification defines public flow states, minimal collection/review/confirmation behavior, domain-error UX, privacy/browser-data constraints, abuse controls, and boundaries with the authoritative domain modules.

## Non-goals

- Customer signup, password, customer account/profile, social login, or persistent customer authentication.
- Final package price/duration/status, calendar eligibility, capacity, booking status transitions, booking confirmation integrity, public tracking credential, or general public booking lookup.
- Fixed slots, capacity assumptions, payment processing, card/PIX/banking credentials, CAPTCHA/provider selection, analytics provider, or notification provider.
- Choosing frontend/backend framework, database, ORM, session mechanism, idempotency mechanism, cloud provider, or HTTP mapping.

## Unauthenticated public flow and states

MVP requires no customer login or account. A future temporary technical interaction/session may support security/usability, but must not become a customer account without a separately approved specification.

The approved customer flow is preserved:

1. Discover/select an available day.
2. Discover/select an available time.
3. Enter personal data.
4. Enter vehicle data.
5. Choose `DROP_OFF` or `PICKUP_REQUESTED`.
6. If pickup is selected, enter pickup address.
7. Discover/select wash package and authoritative displayed price.
8. Select intended payment method.
9. Review material booking terms.
10. Explicitly confirm booking.

The flow may validate progressively and return to earlier steps for safe correction. It must not materially reorder approved information without human approval. Since package duration affects final availability, a time shown before package selection is advisory and must be revalidated at confirmation.

## Package, date, and availability discovery

- `service-catalog` supplies safe public projections of active packages. The public flow renders package name/description, displayed BRL price, and duration only as server-provided non-authoritative display data.
- `operating-calendar` may supply minimum derived calendar information approved for the booking experience; raw administrative calendar rules are not public.
- Displayed dates/times never reserve capacity or imply a temporary hold. No hold is introduced unless a future approved specification does so.
- `booking-lifecycle` remains authoritative at confirmation for current package, commercial terms, calendar, duration, capacity/resource policy, and final integrity.
- The public client may submit customer choices/references but never calculates or submits authoritative price, currency, duration, package revision, snapshot, end time, calendar eligibility, capacity, or booking status.

## Customer, vehicle, service-mode, and payment-intention collection

- Collect only full name, phone/WhatsApp, CPF, optional email, vehicle model, licence plate, and vehicle colour.
- CPF remains a current MVP requirement and is subject to the approved official-source verification gate before CPF storage implementation is finalized. This flow makes no legal claim and does not remove CPF.
- `DROP_OFF` must not require or retain an unnecessary pickup address.
- `PICKUP_REQUESTED` requires pickup address before review/confirmation.
- The flow selects only intended payment method. It must not collect/display card number, CVV, banking credentials, PIX secret/key credential, payment-provider token, or payment-provider credentials.
- Supported MVP payment-method values are unresolved. Once approved, the public flow presents only the server-validated allowlisted/domain values from `booking-lifecycle`.

## Review and explicit confirmation contract

- Before final confirmation, the customer reviews selected date/start time, package name, package description or concise included-service representation, authoritative displayed BRL price, estimated duration, service mode, pickup information only when relevant, intended payment method, and customer/vehicle information needed to catch mistakes.
- Privacy minimization applies to repeated fields: review must not unnecessarily display full CPF after entry and must evaluate masking/redaction for sensitive data.
- The final confirmation action is explicit. Selecting a package/time, changing a step, or loading/reloading a page must never create a booking.
- Final confirmation invokes `booking-lifecycle`'s authoritative confirmation boundary using one confirmation intent; the UI cannot replace its validation or snapshot creation.

## Stale terms, stale calendar, and capacity UX

- `STALE_COMMERCIAL_TERMS`: do not confirm silently. Present current server-authoritative package terms and require explicit renewed review/confirmation; distinguish this outcome from generic validation failure.
- `CALENDAR_NO_LONGER_ELIGIBLE`: explain that the previously selected time is no longer available and direct the customer to current date/time selection without exposing internal calendar rules or other bookings.
- `CAPACITY_UNAVAILABLE`: provide a safe path to select/review current availability without exposing bay counts, staff counts, concurrency state, or other customers' schedules.
- The flow must not present any advisory selection as held/reserved and must not use client-cached terms/calendar state to override current server state.

## Retry, duplicate submission, and outcome UX

- The public flow supports the `booking-lifecycle` idempotency contract. Double-clicks, browser/network retries, and timeout recovery must not intentionally create a second confirmation intent.
- The UX distinguishes `CONFIRMED`, `DUPLICATE_OR_RECOVERED_CONFIRMATION`, still-resolving/unknown outcome where applicable, safe retry/recovery, and `IDEMPOTENCY_CONFLICT`.
- After ambiguous timeout, it must not automatically generate a new intent or confirmation request until the authoritative result of the original intent has been resolved according to `booking-lifecycle`.
- A material change by the customer after a prior intent requires an intentional new confirmation attempt; the eventual contract determines how the client requests that new intent without selecting a key/transport mechanism here.

## Minimal successful confirmation response

- The customer-facing success response is limited to information needed to confirm the booking just created, subject to `privacy-governance` and field minimization.
- It must not create a general public booking lookup, expose internal booking identifiers as credentials, or disclose another customer's data.
- The future `public-status-tracking` module owns any secure external tracking credential, storage, transport, URL, and status-minimum lookup. If a future credential is returned after confirmation, its contract belongs there, not here.

## Validation and error UX contract

The transport-independent public/domain outcomes are:

| Outcome | Public-flow behavior |
|---|---|
| `INVALID_INPUT` | Identify correctable input at the relevant step without exposing security/persistence detail. |
| `STALE_COMMERCIAL_TERMS` | Show current authoritative terms and require renewed review. |
| `CALENDAR_NO_LONGER_ELIGIBLE` | Return to current availability selection safely. |
| `CAPACITY_UNAVAILABLE` | Offer current availability selection without capacity internals. |
| `DUPLICATE_OR_RECOVERED_CONFIRMATION` | Safely identify/recover the prior outcome without creating another booking. |
| `IDEMPOTENCY_CONFLICT` | Explain that the current attempt cannot be reused as submitted; preserve safety and offer a deliberate new attempt path. |
| `CONFIRMED` | Show the minimal contextual confirmation response. |

Errors must not expose stack traces, database details, internal booking IDs unnecessarily, capacity state, other customers' records, PII, audit internals, or security configuration. HTTP status mapping is deferred.

## Privacy, browser-data, and content-safety boundaries

- No booking PII belongs in public URLs/query strings, analytics, raw request/response logs, browser-visible error diagnostics, or public tracking output.
- Minimize repeated display of CPF/address/contact data and clear sensitive in-page state when it is no longer required where appropriate.
- Evaluate browser history, cache, autofill, screenshots, shared-device use, referrer leakage, reverse proxies/CDN/access logs, monitoring, copied URLs, and third-party-resource exposure for pages carrying sensitive inputs. Do not silently prohibit useful browser behavior; select controls later based on usability/security tradeoffs.
- Package descriptions and every echoed user-provided value—names, addresses, vehicle data, and error messages—must be safely rendered and never treated as executable/trusted HTML.
- Production PII must not be copied into local development, test, demo, CI, or staging by default. Tests/demos use synthetic data.

## Abuse controls, rate limits, and CSRF

- As an unauthenticated surface, the flow requires controls against booking spam, automated submissions, excessive availability queries, validation probing, repeated failed confirmations, and resource exhaustion.
- Rate limits and abuse signals must distinguish availability discovery/normal public traffic from confirmation attempts. They must combine appropriate signals where available and not rely on IP address alone.
- Abuse controls must not reveal whether another customer's booking exists and must not expose capacity internals.
- CAPTCHA/challenge/provider technology is not selected here; it requires later justification and approval.
- CSRF depends on the future browser/session model. If confirmation uses ambient browser credentials or a temporary server-side session, it requires appropriate CSRF protection. If a future model is not vulnerable to classical CSRF, that model must document why. Mechanism is deferred.

## Accessibility and basic usability

- The multi-step flow must support keyboard operation, visible focus, clear step/progress context, and programmatically associated labels/errors.
- Validation, stale-state, capacity, and confirmation outcomes must be understandable without relying only on color, timing, or transient visual effects.
- The review/confirmation action must make the final effect clear and must prevent accidental duplicate activation without hiding the authoritative retry outcome.
- Mobile use is a primary product context; fields and actions must remain usable on a small viewport without relying on hover or precise pointer input.

## Module boundaries

### `service-catalog`

Consumes safe active public projections only. It cannot alter catalogue authority, terms, revision, activation, or snapshots.

### `operating-calendar`

Consumes minimum derived calendar information only. It cannot determine final bookability, change calendar rules, or treat displayed time as reserved.

### `booking-lifecycle`

Calls authoritative commands and handles their distinguished outcomes. It cannot override package/calendar/capacity/confirmation/status/PII invariants.

### `public-status-tracking`

Has no tracking-token, status-projection, URL, or lookup design in this module. It remains a future separate status-minimum capability.

## Implementation gates

Before final production confirmation flow is complete, the authoritative capacity/resource policy must be approved, actual business timezone configured, intended payment-method values approved, and CPF source-driven verification completed before CPF storage implementation is finalized. Capacity must never default to one.

## Technology, commands, project structure, code style, and testing

- **Tech stack:** Deferred. No frontend/backend framework, database, ORM, CAPTCHA/analytics/session/idempotency/capacity mechanism, cloud provider, notification provider, or tracking-token mechanism is selected.
- **Commands:** Not applicable. This specification defines public orchestration requirements and creates no executable artifact.
- **Project structure:** Deferred. No implementation layout is selected.
- **Code style:** Not applicable. No application code or interface binding is selected.
- **Testing and verification expectations:** Future implementation must verify the full happy path; no customer login; required/optional/conditional fields; drop-off address removal; pickup-address requirement; authoritative package values; stale terms/re-review; stale calendar/capacity outcomes; review and explicit confirmation; double-click/retry/timeout recovery; idempotency conflict; minimal confirmation response; no internal ID public access; abuse/rate limits; CSRF invariant; XSS-safe rendering; no PII in URLs/logs/analytics/errors; shared-device/browser-history/cache considerations; accessibility; and synthetic test data.

## Acceptance criteria

- [ ] The unauthenticated flow preserves all approved customer steps without introducing a customer account, signup, password, profile, or social login.
- [ ] Public discovery is advisory only and cannot reserve time or override authoritative catalogue/calendar/capacity state.
- [ ] Only approved required/optional/conditional booking data is collected; drop-off removes unnecessary address, pickup requires address, and payment remains intent-only with no payment credentials.
- [ ] Review presents material authoritative terms with minimized sensitive-data repetition, and only explicit final confirmation can request booking creation.
- [ ] Stale package terms require renewed review; stale calendar and capacity outcomes are distinct where useful and lead safely to current selection without internal disclosure.
- [ ] Client values never become authoritative for package terms, interval, calendar, capacity, status, revision, or snapshot.
- [ ] Retry/double-submission/timeout behavior follows the idempotency contract without automatically generating a second intent after an unknown outcome.
- [ ] Success response is minimal and contextual, creates no general public booking reader, and does not use internal `bookingId` as public access.
- [ ] PII is absent from URLs, analytics, raw logs, diagnostics, and public status output; browser-data risks and safe rendering are addressed.
- [ ] Abuse controls, differentiated rate limits, CSRF analysis, accessibility, and implementation gates are specified without technology choices.

## Boundaries

### Always

- Keep the flow unauthenticated and customer-account-free.
- Treat every displayed term/date/time as advisory until authoritative confirmation.
- Collect only approved data; apply pickup/address conditionality, payment-intention-only rules, privacy minimization, safe rendering, and synthetic non-production data.
- Require review and explicit confirmation; preserve distinct stale/capacity/retry outcomes.
- Apply public abuse controls and rate limiting without leaking bookings/capacity.
- Preserve domain-module authority and complete implementation gates before final production confirmation flow.

### Ask First

- Materially reordering the approved customer flow, including package selection before time discovery for package-specific availability.
- Defining supported payment-method values, public projection detail, confirmation response fields, sensitive-data masking/autofill/history behavior, or customer-facing stale/retry wording.
- Selecting session/CSRF/CAPTCHA/analytics/idempotency/capacity/framework/database/ORM/cloud/notification/tracking technology.

### Never

- Create a customer account, signup, password flow, profile, social login, general public booking reader, or public status credential in this module.
- Treat client-submitted price/currency/duration/revision/snapshot/end time/eligibility/capacity/status as authoritative or imply a selection reserves capacity.
- Confirm a booking without explicit final action, renewed review of stale terms, or booking-lifecycle authority.
- Collect payment credentials, retain pickup address for drop-off, expose PII/internal details/capacity state in public errors, or put PII in URLs/analytics/raw logs.
- Automatically generate a new confirmation intent after an unknown outcome or choose an implementation technology.

## Open questions requiring human approval

1. Should package selection occur before final time availability discovery to support package-duration-specific availability, or should the approved sequence remain with advisory time selection until confirmation?
2. What payment-method values are supported in MVP?
3. What minimum fields may appear in the contextual successful confirmation response?
4. What masking/redaction, autofill, history/cache, and shared-device behavior is appropriate for CPF, address, and contact data?
5. What public availability/calendar detail should be exposed before final bookability is calculated?
6. What customer-facing wording and recovery path should be used for stale terms, unavailable capacity, unknown outcomes, and idempotency conflicts?

