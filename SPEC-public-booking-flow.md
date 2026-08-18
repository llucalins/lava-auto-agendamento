# Spec: public-booking-flow

## Status

Draft for human review. This is the Phase 1 specification for `public-booking-flow` only. It does not authorize planning, implementation, or specification of `public-status-tracking`, `admin-operations`, or another module.

## Objective

Define the unauthenticated customer-facing orchestration for selecting an active wash package, discovering package-specific advisory availability, entering the approved booking data only after an operationally plausible selection, reviewing current authoritative terms, and explicitly requesting final booking confirmation. It improves usability and safety at the public boundary but is never authoritative for package, calendar, capacity, status-transition, or booking-integrity decisions.

## Scope

This specification defines public flow states, package-specific availability discovery, minimal collection/review/confirmation behavior, stale-state and domain-error UX, privacy/browser-data constraints, abuse controls, and boundaries with the authoritative domain modules.

## Non-goals

- Customer signup, password, customer account/profile, social login, or persistent customer authentication.
- Final package price/duration/status, calendar eligibility, capacity, booking status transitions, booking confirmation integrity, public tracking credential, or general public booking lookup.
- Fixed slots, capacity assumptions, temporary holds/reservations, payment processing, card/PIX/banking credentials, CAPTCHA/provider selection, analytics provider, or notification provider.
- Choosing frontend/backend framework, database, ORM, browser session/storage mechanism, idempotency mechanism, cache technology, cloud provider, or HTTP mapping.

## Unauthenticated public flow and states

MVP requires no customer login or account. A future temporary technical interaction/session may support security/usability, but must not become a customer account without a separately approved specification.

The approved MVP customer flow is:

1. Discover/select wash package.
2. Discover/select available day for the selected package.
3. Discover/select available start time compatible with the selected package's authoritative duration.
4. Enter personal data.
5. Enter vehicle data.
6. Choose `DROP_OFF` or `PICKUP_REQUESTED`.
7. If `PICKUP_REQUESTED`, enter pickup address.
8. Select intended payment method.
9. Review material booking terms and entered data.
10. Explicitly confirm booking.

This sequence is approved and is not an open question. Package selection precedes final availability because its authoritative duration affects calendar eligibility and final availability; it reduces misleading preliminary times. Sensitive customer data is collected only after the customer has found an operationally plausible package/date/time selection. Displayed availability remains advisory and never reserves capacity. The flow may validate progressively and return to earlier steps for safe correction, but must not materially reorder this approved information without human approval.

## Package, date, and availability discovery

- `service-catalog` supplies safe public projections of active packages. The public flow renders package name/description, displayed BRL price, and duration only as server-provided, non-authoritative display data.
- The client may identify the selected package by reference. It must not provide authoritative package activation state, revision, price, currency, duration, end time, calendar eligibility, capacity calculation, or final availability decision.
- After package selection, availability discovery must use that package reference. The server/domain boundary remains authoritative for package activation state and revision, price, currency, duration, calendar eligibility, and final capacity.
- Initial authoritative capacity is `N = 1` concurrent service, evaluated over authoritative duration-based half-open intervals rather than fixed time slots. This remains server/domain policy: the public flow neither calculates nor discloses it, and a later capacity change must not alter the public flow's non-authoritative role.
- `operating-calendar` may supply only minimum derived customer-facing availability information approved for this flow. Raw administrative calendar rules, blocked-period reasons, revisions, notes, internal resource use, and other customers' bookings are not public.
- Package-specific availability must disclose only the minimum days/times needed for customer selection. It must not disclose bay count, staff count, capacity `N`, exact internal resource usage, other customers' bookings, internal calendar rules, or blocked-period reasons unless separately approved as public content.
- A selected package change makes all previously selected date/time availability stale. The flow must re-evaluate it before review; it must not carry a prior selection forward as valid merely because the client still has it.
- Displayed dates/times never reserve capacity or imply a temporary hold. No hold is introduced unless a future approved specification does so.
- `booking-lifecycle` remains authoritative at confirmation for current package, commercial terms, calendar, duration, capacity/resource policy, and final integrity.

## Customer, vehicle, service-mode, and payment-intention collection

- Collect only full name, phone/WhatsApp, CPF, optional email, vehicle model, licence plate, and vehicle colour.
- CPF remains a current MVP business requirement. It is collected in this personal-data step—after package/date/time selection—and is not claimed to be universally required by Brazilian law/fiscal rules. It is ordinary personal data under LGPD and an internal high-risk PII classification, not statutory sensitive personal data. Before production CPF storage is finalized, the controller must document concrete purpose, lawful basis, necessity/proportionality, and transparency obligations; this flow makes no legal claim and does not remove CPF.
- `PICKUP_REQUESTED` requires pickup address before review/confirmation.
- If the customer changes from `PICKUP_REQUESTED` to `DROP_OFF`, remove the pickup address from the material booking request/state. Do not persist or submit it to `booking-lifecycle`, or retain it as hidden booking data for convenience. Any temporary UI-memory behavior is an implementation decision that must comply with `privacy-governance`.
- The flow selects only intended payment method. It must not collect/display card number, CVV, banking credentials, PIX secret/key credential, payment-provider token, or payment-provider credentials.
- The authoritative MVP intended-payment-method values are `PIX`, `CASH`, `CREDIT_CARD`, and `DEBIT_CARD`. The public flow presents only those server-validated allowlisted/domain values; localized labels may be selected later.

## Review, invalidation, and explicit confirmation contract

- Before presenting final review, the flow must resolve/reconcile current server-authoritative material package and scheduling terms; review must not rely only on stale frontend state.
- Review must show current authoritative package name, customer-facing description or included-service representation, BRL price, estimated duration, selected start time subject to current calendar/availability state, service mode, and intended payment method, plus only the customer/vehicle/pickup information needed to catch mistakes.
- Review must not unnecessarily redisplay full CPF. It must use a masked/redacted representation sufficient for recognition/checking without defining a masking algorithm here. Pickup address and contact data must be repeated only to the minimum useful degree for detecting mistakes. The original authoritative inputs remain server-side validated.
- Any material customer change after review invalidates the prior review approval and requires review again before final confirmation. At minimum, material changes are package; date/start time; service mode; pickup address; intended payment method; and customer or vehicle data to be stored in the booking. A customer must not approve one state and silently confirm a materially different state.
- The final confirmation action is explicit. Selecting a package/time, changing a step, or loading/reloading a page must never create a booking.
- Final confirmation invokes `booking-lifecycle`'s authoritative confirmation boundary using one confirmation intent. The UI cannot replace its package, calendar, capacity, or booking-invariant revalidation, nor its snapshot creation.

## Stale package, availability, calendar, and capacity UX

- If package terms or selected availability become stale before review, refresh current authoritative terms/availability, clearly indicate that the prior selection changed, and require customer acknowledgement/review of the new state. Do not silently carry forward an invalid time.
- If the package is now `INACTIVE`, require selection of another active package. If its duration changed, revalidate the prior date/time against current availability before it can be reviewed; if no longer valid, require a new date/time selection.
- `STALE_COMMERCIAL_TERMS`: do not confirm silently. Present current server-authoritative package terms and require explicit renewed review/confirmation; distinguish this outcome from generic validation failure.
- `CALENDAR_NO_LONGER_ELIGIBLE`: explain that the previously selected time is no longer available and direct the customer to current package-specific date/time selection without exposing internal calendar rules or other bookings.
- `CAPACITY_UNAVAILABLE`: provide a safe path to select/review current availability without exposing bay counts, staff counts, concurrency state, resource use, or other customers' schedules.
- The flow must not present any advisory selection as held/reserved and must not use client-cached terms/calendar/availability state to override current server state.

## Retry, duplicate submission, and outcome UX

- The public flow preserves the `booking-lifecycle` idempotency contract. Editing form data before final confirmation does not require generating multiple confirmation attempts.
- Once a confirmation intent is submitted, double-clicks, browser/network retries, and ambiguous timeout recovery must continue resolving that same intent. The UI must not generate a replacement intent merely because the customer clicks again after an ambiguous outcome.
- The UX distinguishes `CONFIRMED`, `DUPLICATE_OR_RECOVERED_CONFIRMATION`, still-resolving/unknown outcome where applicable, safe retry/recovery, and `IDEMPOTENCY_CONFLICT`.
- If the original intent is authoritatively confirmed, show or recover its original contextual confirmation outcome; do not create another booking.
- A material booking-data change after a submitted intent requires a deliberate new confirmation attempt only after the previous intent's authoritative outcome is resolved. Intent/key/transport representation remains deferred.

## Minimal successful confirmation response

- The customer-facing success response is contextual to the just-completed interaction: it clearly states that the booking was confirmed and shows only the minimum material booking summary useful to the customer.
- It avoids unnecessary redisplay of CPF and other sensitive PII, does not expose internal `bookingId` as a lookup credential, and does not create a reusable unauthenticated general booking reader.
- Exact minimal fields remain a product/UI decision. `public-status-tracking` remains responsible for any later secure tracking credential; no tracking credential, storage, transport, URL, or lookup design is created here.

## Validation and error UX contract

The transport-independent public/domain outcomes are:

| Outcome | Public-flow behavior |
|---|---|
| `INVALID_INPUT` | Identify correctable input at the relevant step without exposing security/persistence detail. |
| `STALE_COMMERCIAL_TERMS` | Show current authoritative terms and require renewed review. |
| `CALENDAR_NO_LONGER_ELIGIBLE` | Return to current package-specific availability selection safely. |
| `CAPACITY_UNAVAILABLE` | Offer current availability selection without capacity internals. |
| `DUPLICATE_OR_RECOVERED_CONFIRMATION` | Safely identify/recover the prior outcome without creating another booking. |
| `IDEMPOTENCY_CONFLICT` | Explain that the current attempt cannot be reused as submitted; preserve safety and offer a deliberate new attempt path only after resolution. |
| `CONFIRMED` | Show the minimal contextual confirmation response. |

Errors must not expose stack traces, database details, internal booking IDs unnecessarily, capacity state, other customers' records, PII, audit internals, or security configuration. HTTP status mapping is deferred.

## Privacy, browser-data, cache, and third-party-resource boundaries

- Application-controlled durable browser storage must not place raw booking PII such as CPF, pickup address, phone, email, or licence plate in `localStorage`, `sessionStorage`, IndexedDB, URLs, or similar durable client-side application storage by default.
- Do not silently choose a browser storage or session mechanism. If temporary browser state is required for this multi-step interaction, a later architecture must minimize its lifetime and exposure and justify the mechanism against privacy and shared-device risks. Browser autofill is a separate usability/security decision, not application-managed persistent storage.
- Pages/responses containing sensitive booking data must not be stored in shared or intermediary caches. The eventual architecture must define appropriate browser/cache controls for sensitive booking interaction pages and confirmation responses; exact header syntax is deferred.
- PII and secrets must not appear in URLs/query strings, referrers, proxy/CDN access logs through URL leakage, analytics, raw application logs, browser-visible error diagnostics, or public tracking output. History-visible URLs must contain no booking PII or secrets; this does not claim that browser history contains no trace of page visits.
- Pages carrying sensitive booking inputs must minimize unnecessary third-party resources/integrations. No analytics, support widget, advertising script, telemetry integration, or third-party resource may receive booking PII unless separately approved under `privacy-governance` with an explicit minimum-data contract. No vendor is selected here.
- Package descriptions and every echoed user-provided value—names, addresses, vehicle data, and error messages—must be safely rendered and never treated as executable/trusted HTML.
- Production PII must not be copied into local development, test, demo, CI, or staging by default. Tests/demos use synthetic data.

## Abuse controls, rate limits, and CSRF

- As an unauthenticated surface, the flow requires controls against booking spam, automated submissions, excessive package/catalogue discovery, package-specific availability queries, validation probing, repeated failed confirmations, and resource exhaustion.
- Abuse controls and rate limits must distinguish package/catalogue discovery, availability discovery, validation, and final confirmation. Package-specific availability queries must be rate-limited without making normal customer exploration unusable.
- Limits and abuse signals must combine appropriate signals where available and not rely on source IP alone. Controls must not reveal whether another customer's booking exists or expose capacity internals.
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

Calls authoritative commands and handles their distinguished outcomes. It cannot override authoritative package, calendar, capacity, confirmation, status, PII, or concurrency invariants.

### `public-status-tracking`

Has no tracking-token, status-projection, URL, or lookup design in this module. It remains a future separate status-minimum capability.

## Implementation gates

The production confirmation flow must preserve `America/Fortaleza` as authoritative business timezone, the initial `N = 1` capacity policy without exposing capacity or introducing fixed slots, and the approved intended-payment-method allowlist. Before production CPF storage is finalized, the controller must complete the approved concrete purpose/lawful-basis/necessity/transparency documentation gate.

## Technology, commands, project structure, code style, and testing

- **Tech stack:** Deferred. No frontend/backend framework, database, ORM, CAPTCHA/analytics/session/browser-storage/idempotency/capacity/cache mechanism, cloud provider, notification provider, or tracking-token mechanism is selected.
- **Commands:** Not applicable. This specification defines public orchestration requirements and creates no executable artifact.
- **Project structure:** Deferred. No implementation layout is selected.
- **Code style:** Not applicable. No application code or interface binding is selected.
- **Testing and verification expectations:** Future implementation must verify the approved package-first happy path; `America/Fortaleza` business-time semantics; active-package-only package-specific availability; initial `N = 1` capacity without fixed slots or public capacity disclosure; package-change staleness; no client-authoritative duration/end-time/capacity calculation; required/optional/conditional fields; CPF collection after package/date/time selection and its documentation gate; allowlisted intended-payment values without payment credentials/processing; pickup-address requirement and removal when changing to drop-off; current authoritative review reconciliation; review invalidation for every material change; stale/inactive/duration-changed package and stale availability recovery; final package/calendar/capacity revalidation; double-click/retry/timeout recovery of one intent; idempotency conflict and deliberate new-attempt path; minimal contextual confirmation response; no internal ID public access; differentiated abuse/rate limits; CSRF invariant; XSS-safe rendering; no PII in durable browser storage, URLs/referrers/logs/analytics/errors; cache and shared-device considerations; third-party-resource boundary; accessibility; and synthetic test data.

## Acceptance criteria

- [ ] The unauthenticated flow uses the approved package-first customer sequence without introducing a customer account, signup, password, profile, or social login.
- [ ] Package-specific availability uses only a customer-selected package reference; server/domain authority controls activation, revision, price, currency, duration, calendar eligibility, and final capacity, and no displayed availability reserves capacity.
- [ ] Changing a package makes selected availability stale; inactive packages require another active selection and duration changes require date/time revalidation before review.
- [ ] Only approved required/optional/conditional booking data is collected; drop-off removes unnecessary address, pickup requires address, and payment remains intent-only with no payment credentials.
- [ ] Review reconciles current authoritative material terms, minimizes CPF/contact/address display, and is invalidated by every material customer-data, package, schedule, mode, address, or payment-intention change before explicit confirmation.
- [ ] Stale package terms and selected availability clearly require acknowledgement/review of current state; stale calendar and capacity outcomes are distinct where useful and safely lead to current selection without internal disclosure.
- [ ] Client values never become authoritative for package terms, interval, calendar, capacity, status, revision, or snapshot; final confirmation retains `booking-lifecycle` revalidation authority.
- [ ] Retry/double-submission/timeout behavior resolves the same submitted intent, recovers an authoritative prior confirmation when present, and does not create a replacement intent until prior outcome resolution; material post-submission changes require a deliberate new attempt.
- [ ] Success response is minimal and contextual, avoids unnecessary sensitive PII, creates no general public booking reader, and does not use internal `bookingId` as public access.
- [ ] Raw booking PII is absent from application-controlled durable browser storage by default, URLs/referrers, analytics, raw logs, diagnostics, and public status output; cache, third-party-resource, browser-history, autofill, and shared-device constraints are addressed without selecting mechanisms.
- [ ] Public availability reveals only minimum customer-facing information, not capacity/resource/calendar/other-customer internals; abuse controls use differentiated, non-IP-only rate limits without technology choices.
- [ ] Accessibility and the approved timezone, initial capacity, payment, and CPF documentation gates are specified without choosing implementation technology.

## Boundaries

### Always

- Keep the flow unauthenticated and customer-account-free, and preserve the approved package-first sequence.
- Treat every displayed term/date/time as advisory until authoritative confirmation; use package references only and re-evaluate availability after a package change.
- Collect only approved data; apply pickup/address conditionality, payment-intention-only rules, privacy minimization, safe rendering, and synthetic non-production data.
- Reconcile current authoritative terms before review; invalidate review after material changes; require explicit confirmation and preserve distinct stale/capacity/retry outcomes.
- Keep raw booking PII out of application-controlled durable browser storage by default and out of URLs/referrers/logs/analytics; require future cache and third-party-resource controls for sensitive pages.
- Apply differentiated public abuse controls and rate limiting without leaking bookings/capacity.
- Preserve domain-module authority, `America/Fortaleza`, initial `N = 1` capacity abstraction, approved payment allowlist, and the CPF documentation gate before final production confirmation flow.

### Ask First

- Materially reordering the approved customer flow.
- Changing payment-method values, capacity policy, business timezone, public projection/availability detail, confirmation response fields, sensitive-data masking/autofill/history/cache/shared-device behavior, or customer-facing stale/retry wording.
- Selecting session/browser-storage/CSRF/CAPTCHA/analytics/idempotency/capacity/cache/framework/database/ORM/cloud/notification/tracking technology.

### Never

- Create a customer account, signup, password flow, profile, social login, general public booking reader, or public status credential in this module.
- Treat client-submitted price/currency/duration/revision/snapshot/end time/eligibility/capacity/status as authoritative, imply a selection reserves capacity, or introduce temporary holds.
- Confirm a booking without explicit final action, renewed review of stale terms, review after material changes, or `booking-lifecycle` authority.
- Collect payment credentials; retain, persist, or submit pickup address for drop-off; expose PII/internal details/capacity state in public errors; or put booking PII in application-controlled durable browser storage, URLs/referrers, analytics, or raw logs.
- Generate a replacement confirmation intent after an unknown outcome before resolving the prior intent, or choose an implementation technology.

## Open questions requiring human approval

1. What minimum fields may appear in the contextual successful confirmation response?
2. What detailed masking/redaction, autofill, and shared-device behavior is appropriate for CPF, address, and contact data?
3. What exact public availability/calendar detail should be exposed before final bookability is calculated?
4. What customer-facing wording and recovery path should be used for stale terms, unavailable capacity, unknown outcomes, and idempotency conflicts?
