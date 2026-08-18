# Spec: admin-operations

## Status

Draft for human review. This is the Phase 1 specification for `admin-operations` only. It does not authorize planning, implementation, `customer-notifications`, or work on another module.

## Objective

Define the protected administrative orchestration boundary for authorized day-to-day booking operations and approved business configuration. It coordinates server-side authorization from `admin-access`, audit requirements from `audit-trail`, and commands/projections from `booking-lifecycle`, `service-catalog`, and `operating-calendar`, without duplicating or bypassing their domain invariants.

## Assumptions

1. `admin-operations` is not a domain owner: booking status/cancellation/capacity, package validity/snapshots, calendar validity/eligibility, authentication/sessions, and audit persistence remain owned by their approved modules.
2. MVP list/detail projections, search filters, package creation, and no-export boundaries are approved below; role-to-permission mapping remains owned by `admin-access`.
3. Audit-record browsing, account/privilege lifecycle management, customer-data exports, and tracking-credential recovery/replacement are not introduced here.
4. The authoritative business timezone is supplied by `operating-calendar`; browser timezone is never authoritative.
5. This is the single `admin-operations` capability already approved in `CAPABILITY_MAP.md`; no plan, task list, or new capability map is created.

## Scope

This specification defines protected administrative read projections, booking status/cancellation orchestration, approved catalogue/calendar mutation orchestration, authorization and audit boundaries, concurrency/stale outcomes, privacy, browser/abuse safeguards, and future verification expectations.

## Non-goals

- Customer/public booking, public tracking verification, general public booking lookup, payment/refund processing, automatic rescheduling, notifications, or public status credential recovery.
- Customer account functionality, administrative account bootstrap, MFA, recovery, session implementation, role/permission creation, privilege grants, staff offboarding, or audit-record review/export implementation.
- Reimplementing booking state transitions, confirmation capacity logic, cancellation invariants, package validation/snapshot rules, calendar precedence/eligibility, authentication/session logic, or audit persistence.
- Choosing a frontend/backend framework, database, ORM, authorization library, transaction/queue/cache/search/export library, audit storage, cloud provider, or HTTP mapping.

## Protected administrative boundary and authorization

- Every operation is protected. `admin-access` authenticates the individual actor and supplies current server-authoritative authorization context; `admin-operations` authorizes the actor, action, target resource, and sensitive field where applicable before orchestration.
- Authentication alone is insufficient. Authorization is default-deny: missing, unknown, stale, or ungranted permission, resource scope, field permission, or mapping denies the action.
- Client routes, hidden buttons, role labels, client state, and possession of internal identifiers never authorize an operation. `bookingId` is an internal administrative reference only, never an authorization capability.
- Least privilege applies to every read and mutation. A permitted generic booking read does not imply access to CPF, pickup address, audit history, configuration, cancellation, or status mutation.
- Server-side authorization must use current permissions at the protected operation boundary. Rate limits and UI controls are defense-in-depth, never authorization substitutes.

## Administrative booking reads and projections

Administrative reads use explicit field projections. They must not serialize a complete booking aggregate by default, embed sensitive values in hidden fields, or make a broader response usable as a client-side sensitive-data bypass.

| Operation/projection | Minimum approved content | Excluded by default |
|---|---|---|
| Booking list | Authoritative business-local service date/start time; status; package name/service summary; service mode; customer full name; vehicle model; vehicle colour | CPF, pickup address, phone, email, full licence plate, complete aggregate, audit/security/concurrency data |
| Booking detail | Service interval; status; immutable package snapshot; intended payment method; service mode; customer full name; phone/WhatsApp; optional email; vehicle model; full licence plate; vehicle colour | CPF and pickup address unless separately revealed; whole aggregate, audit history, security/session data |
| Sensitive field reveal | One authorized field—CPF or pickup address—for the specified booking and operational purpose | Other sensitive fields, unrelated record data, audit payloads, client-side hidden copies |

- List fields are approved only for day-to-day recognition, not customer profiling. Role-to-permission mapping remains governed by `admin-access`; no role-name authorization is hardcoded here. Lists never expose full CPF or pickup address.
- `today`, `upcoming`, and `history` are date categories evaluated in `operating-calendar`'s authoritative named business timezone, never browser timezone. `today` means service date equals the current business-local date; `upcoming` means service date is after it; `history` means service date is before it. Status is a filter/presentation dimension, not the date-category definition.
- Same-day `COMPLETED` and `CANCELLED` bookings remain in `today`; future `CANCELLED` bookings remain in `upcoming` unless a status filter hides them; past bookings remain in `history` regardless of terminal status. Suggested default sort semantics are `today` start-time ascending, `upcoming` service-time ascending, and `history` service-time descending. Default UI ranges, page sizes, and exact controls remain deferred.
- Lists use pagination and bounded filtering in the eventual implementation, but pagination technology, page sizes, sort defaults, and UI framework are deferred.

## Sensitive field access contract

- CPF and pickup-address disclosure each require the explicit corresponding sensitive-field permission defined by `admin-access`, authorization of the specific actor/action/booking/field, and an operational purpose.
- Before revealing either value, `admin-operations` must obtain durable audit acceptance under `audit-trail`. If durable audit acceptance is unavailable, the sensitive value must not be released.
- Audit events record only minimized actor/target/action/outcome and sensitive-data class; they never contain the CPF, address, raw booking payload, contact data, or value viewed.
- CPF, pickup address, contact data, and licence plate must never enter URLs, application logs, analytics, telemetry, error messages, or browser-visible diagnostics. Sensitive data is not preloaded or embedded for later client-side reveal.

## Booking operations

### Status changes

- Status changes invoke `booking-lifecycle`; this module does not implement or override its state machine.
- The approved normal MVP transitions are `SCHEDULED → IN_PROGRESS`, `SCHEDULED → CANCELLED`, and `IN_PROGRESS → COMPLETED`. `COMPLETED` and `CANCELLED` are terminal; `IN_PROGRESS → CANCELLED`, reopening terminal states, backward transitions, and correction workflows are not ordinary operations.
- A status change requires current authorized status-update permission, an authoritative booking revision/equivalent concurrency check, domain transition success, and durable audit confirmation. It must not be reported successful unless the domain effect and required audit event have coherent durable acceptance.

### Cancellation

- Cancellation is invoked only where `booking-lifecycle` permits it and requires an explicit cancellation permission and durable audit confirmation.
- It preserves booking history, never hard-deletes a booking, and must comply with `booking-lifecycle`'s authoritative capacity-release invariant. No refund or payment-reversal workflow is designed here.
- Cancellation must not be reported successful unless cancellation and required audit acceptance are coherently successful. Concurrent cancellation and booking operations retain `booking-lifecycle` authority.

## Service catalogue administration

- Protected catalogue operations include MVP package creation/configuration and name, description, price, duration, activation, or deactivation changes.
- `service-catalog` remains authoritative for server-side validation, exact BRL monetary semantics, `ACTIVE`/`INACTIVE`, package revision, no normal hard deletion, and immutable confirmed-booking snapshots. `admin-operations` does not duplicate these rules.
- Creation and mutation use `packageRevision` or applicable authoritative state. The actor requires the appropriate current package-configuration permission and target authorization. Client-provided terms/revision references are non-authoritative aids to stale detection only.
- Price, duration, activation, and deactivation require durable audit confirmation. Name/description-only changes have lower-risk audit coverage by default; a bundled change inherits the strongest applicable audit requirement.
- Creation containing price, duration, or activation data inherits the strongest applicable audit requirement. A package becomes publicly selectable only after authoritative `ACTIVE` state is successfully established. Successful mutations must not rewrite confirmed booking snapshots; no normal hard delete is introduced.

## Operating-calendar administration

- Protected calendar operations may change recurring weekly operating windows, `CLOSED` date overrides, exceptional opening windows, and temporary unavailability.
- `operating-calendar` remains authoritative for its named business timezone, weekly → date override → temporary-unavailability precedence, half-open `[start, end)` semantics, one coherent `calendarRevision`, rejection of cross-midnight MVP windows, and eligibility evaluation.
- Every eligibility-affecting calendar mutation requires appropriate calendar-configuration permission and durable audit confirmation. This module does not implement calendar validation or eligibility rules.
- Calendar mutations must not automatically cancel, move, or rewrite confirmed bookings. Before silently applying a conflict-causing mutation, the protected workflow detects affected confirmed bookings. If conflicts exist, the initial operation returns `CONFLICT_WITH_EXISTING_BOOKINGS` and does not apply the calendar mutation.
- An administrator must explicitly review/acknowledge the conflict before a deliberate follow-up application attempt. That follow-up uses current authorization, current `calendarRevision` or equivalent state, and required durable audit confirmation. After explicitly approved application, the mutation may take prospective effect; existing confirmed bookings remain unchanged and affected bookings remain detectable/surfaceable for separately approved resolution. Acknowledgement is not permission to mutate bookings.

## Stale mutations and concurrent actions

- `bookingRevision`, `packageRevision`, `calendarRevision`, or equivalent authoritative state protects applicable mutations. The client may carry a non-authoritative revision reference, but the server/domain remains authoritative.
- A stale mutation must not silently overwrite newer state. Where operationally useful, the protected boundary distinguishes `STALE_RESOURCE`/conflict from generic failure and supplies a safe refresh/review path without exposing unauthorized data.
- Concurrent administrative actions must preserve the underlying domain modules' authoritative transition, snapshot, calendar, and capacity invariants. This specification chooses no optimistic-locking, transaction, queue, or coordination mechanism.

## Audit orchestration and failure classes

- `admin-operations` orchestrates each domain effect with `audit-trail` according to the approved durable-audit consistency invariant; it does not persist audit records itself.
- Durable-audit-before-success operations include CPF reveal, pickup-address reveal, booking cancellation, booking status mutation, package price/duration/activation/deactivation mutation, and all eligibility-affecting calendar mutations.
- For those operations, the domain effect and audit acceptance must not silently diverge. The architecture must not permanently report a committed domain mutation as failed merely because audit outcome is unresolved, record a durable `SUCCEEDED` audit event for a mutation that never occurred, or disclose CPF/pickup address when durable sensitive-read audit acceptance failed. Crash, timeout, and retry paths require recoverable authoritative outcome determination without selecting a mechanism.
- Normal non-sensitive operational reads do not automatically require durable audit confirmation and may proceed under the approved lower-risk audit policy. Security-relevant denied operations, suspicious access, and protection-triggered events may emit minimized signals without raw booking/PII payloads.
- Name/description-only package changes retain lower-risk audit coverage by default, following `service-catalog`; bundled mutations inherit durable requirements where any component requires them.
- Audit-record viewing/search/export remains governed by `admin-access` audit-reader permissions and the `audit-trail` boundary. This module does not silently become the general audit-review module.

## Search, filtering, pagination, and bulk-access boundaries

- Lists and filters are bounded and purpose-specific. Approved MVP filters are date/date range, status, package, and internal booking reference when already available to an authorized administrator. They must not become arbitrary customer-data search or a bulk-PII extraction surface.
- MVP has no free-form customer/vehicle PII search, including CPF, pickup address, phone, email, licence plate, or unrestricted customer name. Any future customer/vehicle search requires explicit purpose, field selection, permission, projection, abuse controls, and audit/privacy review.
- Internal `bookingId` can be used as an administrative reference/filter only after authorization; it never grants access by possession.
- MVP includes no CSV/spreadsheet export, bulk customer list, bulk CPF/address view, printable sensitive-data report, or external customer-data export. Any future feature requires a separately approved specification change with purpose, authorization, retention/lifecycle, minimization, and audit classification.

## Privacy, logs, browser, and content-security boundaries

- Apply `privacy-governance`: use explicit field projections, purpose limitation, least privilege, minimized internal references, no unrelated PII duplication, and synthetic data outside production by default.
- Raw CPF, pickup address, phone, email, licence plate, and unnecessary PII must not appear in application logs, analytics, telemetry, traces, error reports, audit events, URLs, support tools, or unmanaged admin caches. Application-controlled durable browser storage must not persist these raw administrative booking values in `localStorage`, `sessionStorage`, IndexedDB, URLs, or similar durable client-side application storage by default. Temporary in-memory UI state exists only as necessary and remains minimized for shared-device risk.
- Sensitive administrative responses, especially CPF/pickup-address reveal responses, must not be stored in shared/intermediary caches. The eventual architecture must explicitly define private-browser/cache behavior for sensitive pages and reveal responses; exact header syntax is deferred.
- Administrative pages preserve `admin-access` requirements: server-validated authenticated sessions, secure `httpOnly` HTTPS-only cookies, no secrets/session tokens in browser storage, no PII in URLs, and shared-device risk controls. Logout, account/session revocation, MFA/recovery, and privilege lifecycle remain owned by `admin-access`; this module does not redefine authentication/session implementation.
- State-changing operations require CSRF protection appropriate to the eventual session model. All package, customer, vehicle, address, and error content must be safely rendered and never used as executable/trusted HTML; security headers remain as required by `admin-access`.

## Administrative abuse controls and error contract

- Protected operations require differentiated protections for normal reads, sensitive reads, high-impact mutations, and repeated authorization failures. Controls combine appropriate signals where available and do not rely solely on IP.
- Rate limiting must not become authorization, leak permission/resource existence, or block required revocation/logout security actions without an approved risk policy.
- The transport-independent outcomes are:

| Outcome | Protected-boundary behavior |
|---|---|
| `UNAUTHENTICATED` | Do not perform the operation; use generic safe handling. |
| `FORBIDDEN` | Deny missing/ungranted actor/action/resource authorization without revealing unauthorized data. |
| `SENSITIVE_FIELD_FORBIDDEN` | Deny CPF/pickup-address reveal without the specific field permission or operational-purpose authorization. |
| `NOT_FOUND_OR_NOT_ACCESSIBLE` | Use where necessary to avoid harmful resource-existence disclosure. |
| `STALE_RESOURCE` | Reject stale mutation safely and require refresh/review. |
| `INVALID_TRANSITION` | Surface a safe actionable state-transition failure from `booking-lifecycle`. |
| `DOMAIN_VALIDATION_FAILED` | Surface correctable domain failure without implementation details. |
| `AUDIT_UNAVAILABLE` | Do not disclose sensitive values or report durable-required mutation success; return a safe retry/deferred outcome. |
| `CONFLICT_WITH_EXISTING_BOOKINGS` | The guarded initial calendar mutation was not applied because affected confirmed bookings were detected; surface only minimum authorized booking references/projection for review, without automatic booking changes or sensitive PII disclosure. |
| `SUCCESS` | Return only the authorized minimal projection/outcome. |

Errors must not reveal unauthorized PII, other actors' permissions, hidden resource existence where harmful, audit internals, stack traces, database details, secrets, capacity internals, or raw request data. HTTP mappings are deferred.

## Relationships with approved modules

### `admin-access`

Supplies current authentication, permission, field-access, session, MFA, CSRF/security, and audit-reader boundaries. `admin-operations` consumes these controls and never manages accounts, privileges, bootstrap, or sessions.

### `booking-lifecycle`

Supplies authoritative booking projections, status transitions, cancellation, revision/concurrency behavior, capacity-release behavior, and booking integrity. `admin-operations` only orchestrates authorized commands and projections.

### `service-catalog`

Supplies authoritative package validation, state, revision, audit classification, and snapshot invariants. `admin-operations` supplies protected invocation only.

### `operating-calendar`

Supplies authoritative timezone, calendar state, revision, eligibility semantics, and confirmed-booking conflict detection. `admin-operations` supplies protected invocation only.

### `audit-trail`

Supplies minimized event contract, durable-audit consistency requirement, and degraded-audit risk policy. `admin-operations` coordinates but does not store audit events.

### `public-status-tracking`

Tracking-credential recovery/replacement is not current MVP scope. If later approved, it is an explicit `admin-operations` extension protected by `admin-access`, must preserve the one-active-credential policy in `public-status-tracking`, requires durable audit confirmation before administrative replacement is reported successful, never records raw credentials in audit/log/telemetry, and must not make predictable customer PII authentication by itself.

## Technology, commands, project structure, code style, and testing

- **Tech stack:** Deferred. No frontend/backend framework, database, ORM, authorization library, transaction/queue/cache/search/export implementation, audit storage, cloud provider, or HTTP framework is selected.
- **Commands:** Not applicable. This specification defines protected orchestration requirements and creates no executable artifact.
- **Project structure:** Deferred. No implementation layout is selected.
- **Code style:** Not applicable. No application code or interface binding is selected.
- **Testing and verification expectations:** Future implementation must verify unauthenticated denial; default-deny actor/action/resource/field authorization; approved list/detail projections and sensitive-field exclusion; CPF/address denial and durable-audit-before-reveal; business-timezone date categories including same-day/future cancellation and past terminal cases; valid/invalid transitions and stale booking revision; cancellation and capacity-release consistency; MVP package creation, catalogue authorization/stale package revision, price/duration/activation durable audit, and name/description lower-risk audit; calendar authorization/stale calendar revision; guarded calendar conflict detection, non-application, deliberate current-state follow-up, and minimum conflict projection; durable-audit contradictory-outcome/recovery behavior; no PII in logs/audit/analytics/errors/URLs/durable browser storage; shared/intermediary and private-browser cache safety; CSRF/XSS/session boundaries; approved bounded filters with no PII search; no MVP bulk/print/export; concurrent actions; and synthetic data only.

## Acceptance criteria

- [ ] `admin-operations` is a protected orchestration boundary and does not duplicate or bypass approved booking, catalogue, calendar, authentication/session, or audit-persistence invariants.
- [ ] Every protected operation uses current server-side default-deny authorization of actor, action, resource, and sensitive field where applicable; routes, UI, role labels, and IDs do not authorize.
- [ ] Booking list, detail, and sensitive-field operations use separate explicit projections: the MVP list includes only service date/start, status, package/service summary, service mode, full name, vehicle model, and colour; normal detail includes the approved contact/vehicle fields but excludes CPF/pickup address; no complete aggregate is serialized.
- [ ] `today`, `upcoming`, and `history` use authoritative business timezone rather than browser timezone and are defined solely by service date; same-day terminal bookings remain today, future cancellations remain upcoming unless filtered, and past bookings remain history regardless of status.
- [ ] CPF/pickup-address reveals require specific field permission, target authorization, operational purpose, and durable audit acceptance before disclosure, with no raw value in audit/log/analytics/telemetry/URL/error channels.
- [ ] Status/cancellation commands retain `booking-lifecycle` authority, use applicable revision protection, respect normal MVP terminal-state rules, and require durable audit confirmation before success is reported.
- [ ] Catalogue operations retain `service-catalog` authority: MVP creation and price/duration/activation/deactivation require durable audit as applicable; name/description-only is lower risk; bundled mutations inherit the strongest requirement; package visibility requires authoritative `ACTIVE` state; no hard delete or snapshot rewrite is introduced.
- [ ] Calendar operations retain `operating-calendar` authority; every eligibility-affecting mutation requires durable audit, and a guarded initial conflict-causing mutation is not applied until explicitly acknowledged and retried against current authorization/revision; confirmed bookings remain unchanged without automatic rescheduling/cancellation.
- [ ] Stale/concurrent operations cannot silently overwrite authoritative state; safe distinguished stale/conflict behavior is available without choosing a coordination mechanism.
- [ ] Normal non-sensitive operational reads are not durable-audit dependencies; durable-required effects and sensitive reads obey recoverable audit/domain consistency without contradictory external outcomes, while security signals remain minimized.
- [ ] Search/filtering is limited to approved date/range, status, package, and already-known internal booking reference; MVP contains no customer/vehicle PII search or bulk/print/export capability.
- [ ] Privacy, safe rendering, CSRF/session/security-header, rate-limit, error-minimization, durable-browser-storage, sensitive-cache, and synthetic-data rules are specified without technology choices.

## Boundaries

### Always

- Orchestrate only authorized commands/projections; preserve each provider module's authoritative domain and audit invariants.
- Authorize actor, action, resource, and sensitive field server-side with current default-deny permissions and least privilege.
- Use the approved MVP list/detail projections; obtain durable audit acceptance before CPF/pickup-address disclosure and durable-required mutations before reporting success.
- Interpret operational date categories in the authoritative business timezone and reject/reconcile stale mutations safely.
- Preserve booking history, confirmed snapshots, capacity-release, and guarded calendar-conflict boundaries without automatic rescheduling or hard delete.
- Minimize PII, prevent durable browser-storage/caching exposure of sensitive data, safely render content, protect admin browser/session/CSRF boundaries, apply differentiated abuse controls, and use synthetic non-production data.

### Ask First

- Adding a protected projection field, changing approved date-category semantics, or choosing UI-specific page sizes/ranges/presentation details.
- Adding customer/vehicle/CPF/address search, bulk/print/export capability, audit-record interface, account/privilege/recovery workflow, or tracking-credential recovery workflow.
- Defining calendar-conflict booking resolution after the deliberately applied mutation, automatic rescheduling, correction/reopening transitions, or payment/refund behavior.
- Selecting framework, database, ORM, authorization/transaction/queue/cache/search/export/audit/cloud/HTTP technology or changing approved audit failure classification.

### Never

- Reimplement or override booking transitions/capacity/cancellation invariants, catalogue validation/snapshots, calendar eligibility/precedence, authentication/session logic, or audit persistence.
- Treat authentication, client UI, role labels, hidden fields, stale client revisions, or internal IDs as authorization.
- Release CPF/pickup address without specific field authorization and durable audit acceptance; embed sensitive values in broad responses; or put PII in URLs/logs/audit/analytics/telemetry/errors.
- Silently overwrite stale state, apply a detected conflict-causing calendar mutation without explicit acknowledgement/current-state retry, hard-delete bookings/packages, automatically cancel/move confirmed bookings, or report durable-required effects successful without audit acceptance.
- Add unrestricted PII search, bulk export, audit review, account/privilege management, public booking/tracking behavior, or implementation technology in this specification.

## Open questions requiring human approval

1. What exact calendar-conflict booking-resolution workflow and authority apply after a conflict-causing calendar mutation is deliberately applied, without automatic cancellation or rescheduling?
2. What future field-permission refinements are needed beyond the currently approved list/detail and CPF/pickup-address projections, subject to `admin-access` approval?
3. What UI-specific page sizes, ranges, and presentation controls are appropriate where they do not alter approved domain/security semantics?
