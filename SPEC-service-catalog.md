# Spec: service-catalog

## Status

Draft for human review. This is the Phase 1 specification for `service-catalog` only. It does not authorize planning, implementation, or specification of `operating-calendar`, `booking-lifecycle`, `admin-operations`, or another module.

## Objective

Define the authoritative domain catalogue of configurable wash packages used by public booking and later protected administrative operations. It provides approved active package data for new bookings while preserving the commercial and operational history of confirmed bookings against later catalogue changes.

`service-catalog` is a domain capability. It has no runtime/domain dependency on `admin-access`. Public booking may read safe projections of active packages. Protected mutations are later exposed by `admin-operations` with `admin-access`; authorization is not designed inside this module.

## Scope

This specification defines:

- Wash-package data, lifecycle, validation, public projection, and authoritative booking-relevant values.
- Package-change, confirmed-booking snapshot/version, deactivation, and concurrent-mutation invariants.
- Boundaries with `booking-lifecycle`, `operating-calendar`, `admin-operations`, and `audit-trail`.

## Non-goals

- Administrative authentication, roles, permissions, or authorization implementation.
- Booking confirmation, scheduling/capacity calculation, payment processing, discounting, tax calculation, invoicing, refunds, or cancellation policy.
- PII collection or storage.
- Choosing a framework, database, ORM, cache provider, cloud provider, currency/payment provider, versioning mechanism, or concurrency mechanism.
- Assuming a final simultaneous vehicle-capacity model.

## Proposed wash-package model

| Field | Purpose and invariant |
|---|---|
| `packageId` | Stable internal package identifier. It is neither a secret nor an authorization capability and must not grant access by possession. |
| `name` | Customer-facing package name. Required, bounded, and suitable for safe rendering. |
| `description` | Customer-facing package description. Optional or required is an open product decision; if present, it is bounded plain display content and must be safely rendered by consumers. |
| `price` | Authoritative non-negative monetary amount for a new booking. The server, never the client, determines it from the selected package configuration. |
| `currency` | Explicit currency associated with the price. MVP supports `BRL` only; multi-currency is out of scope unless a future approved specification changes it. No currency/payment provider is selected here. |
| `estimatedDuration` | Authoritative positive operational estimate used by downstream booking/scheduling logic. It is configurable and must not be hardcoded from the provisional intent examples. |
| `status` | `ACTIVE` or `INACTIVE`. Only active packages are eligible for new public booking selection. |
| `packageRevision` | A server-controlled, per-package revision marker for detecting booking-term changes and concurrent/stale configuration updates. Its representation and persistence mechanism are deferred. |

The module contains no customer, vehicle, account, address, CPF, token, payment credential, or other PII.

## Authoritative values and client input

- The server is authoritative for package price, currency, estimated duration, activation state, `packageRevision`, snapshot creation, and every other booking-relevant package field.
- A public client may submit a package selection by `packageId`, and may later provide a non-authoritative revision/quote reference for stale detection, but must not submit or override price, duration, activation state, currency, revision, or a package snapshot as authoritative data.
- A booking must not trust a client-submitted displayed price, duration, name, description, or package revision.
- At the later booking-confirmation boundary, `booking-lifecycle` must retrieve and validate the authoritative currently eligible package and derive booking-relevant values from it.
- Package identifiers are references only. They must not grant authorization, bypass validation, or be treated as secrets.

## Validation invariants

- `packageId` is stable and unique within the catalogue; its format is an implementation decision.
- Name is required, bounded, normalized according to later presentation rules, and must not be executable/unsafe markup.
- Description, when present, is bounded customer-facing content and must not be treated as trusted HTML by consumers.
- Price is a non-negative monetary amount in `BRL` for MVP. Authoritative monetary values must use exact monetary semantics; binary floating-point must not be used as the authoritative monetary representation or for commercially significant calculations. The concrete decimal/minor-unit representation and rounding mechanics are deferred, but the eventual representation must preserve exact commercial meaning and reject malformed, negative, non-finite, or ambiguous values.
- Currency is explicit for each authoritative price and is `BRL` for MVP. Multi-currency is out of scope and requires a future approved specification change.
- Estimated duration is a positive, bounded operational value. The eventual unit and representation are deferred; it must reject zero, negative, malformed, or implausibly unbounded values.
- Only `ACTIVE` packages appear in the public selection projection.
- Catalogue changes must be validated server-side. Client-side validation may improve usability but is not authoritative.

## Public visibility and safe projections

- Public booking may read only active-package projections required for customer choice: package identifier, name, customer-facing description, authoritative displayed price/currency, and estimated duration where the experience requires it.
- Public projections exclude internal revision/concurrency metadata, audit data, inactive packages, implementation details, administrative notes, and any future non-public fields.
- Public reads are not an authorization capability for protected catalogue mutation.
- Consumers must safely render package name/description; this module does not select a rendering framework or sanitization mechanism.

## Administrative mutation boundary

- `service-catalog` defines valid package state and mutation invariants; it does not authenticate or authorize administrators.
- A future `admin-operations` boundary, protected by `admin-access`, invokes catalogue mutations only after its own server-side authorization checks.
- The catalogue must not infer authorization from route location, caller-provided role names, client state, or package identifier possession.
- Catalogue mutation inputs must be server-side validated against this specification regardless of their protected caller.

## Price and duration change behavior

- A price, currency, duration, name, or description change applies prospectively to new booking confirmations after the authoritative catalogue change is accepted.
- A change must not silently rewrite commercially or operationally relevant data attached to an already-confirmed booking.
- At successful booking confirmation, `booking-lifecycle` preserves an immutable booking-facing snapshot containing only the commercially and operationally relevant package contract: `packageId`, `packageRevision`, customer-facing name, customer-facing description, confirmed price, confirmed currency, and confirmed estimated duration.
- The snapshot is not a complete copy of the catalogue record. Description is included because it may define the services included in the package.
- Later catalogue changes must never silently rewrite these confirmed values. They affect only new confirmations unless a separately approved business workflow explicitly changes a specific booking.
- The eventual storage/version mechanism is deferred. The invariant is that historical bookings remain interpretable and are not silently rewritten by catalogue edits.

## Stale commercial terms and review invariant

- If any booking-relevant package term changes after the customer reviewed the package but before confirmation—including price, currency, estimated duration, activation state, or commercially relevant name/description—the system must not silently confirm using different terms.
- The server must detect that the reviewed package terms are stale and require the customer to review the current authoritative terms again before confirmation.
- A client may later provide a non-authoritative revision/quote reference for stale detection, but the server must always resolve authoritative package state itself.
- If duration changed, booking/scheduling availability must be revalidated using the current authoritative duration.
- If the package became inactive, confirmation must fail safely.
- Confirmation and snapshot creation must use one coherent authoritative `packageRevision` and must not mix package fields across revisions.

## Package activation and deactivation

- Activating a package makes it eligible for new booking selection only after its full authoritative configuration passes validation.
- Deactivating a package prevents new public bookings from selecting it and prevents new confirmations from accepting it.
- Deactivation must not corrupt, invalidate, or silently alter already-confirmed bookings. Existing confirmed bookings retain their preserved package data and remain subject to any separately approved operational/cancellation workflow.
- Reactivation is allowed only through an approved prospective mutation and must not rewrite historic booking snapshots.
- MVP packages are not hard-deleted through normal administrative workflows. They use the `ACTIVE`/`INACTIVE` lifecycle.
- Inactive packages remain available for authorized historical/administrative reference where needed, but never appear as selectable public packages.
- Future hard deletion may be specified later only if justified and approved.

## Concurrency and consistency expectations

- Concurrent catalogue mutations must not silently overwrite each other or produce an invalid partial package state.
- A stale configuration update must be detected or safely reconciled by an explicitly chosen later mechanism; this specification does not choose optimistic locking, transactions, or another mechanism.
- Every accepted booking-relevant package mutation advances or otherwise changes the authoritative `packageRevision`. A future architecture may introduce broader catalogue revisions only if justified.
- New booking confirmation must use an authoritative package state and must not confirm against client-cached/stale price, duration, activation state, revision, or other booking-relevant terms. The relationship to booking availability and atomic confirmation remains the responsibility of `booking-lifecycle`.
- Catalogue updates and booking confirmations must preserve the snapshot/version invariant: a confirmed booking is associated with one coherent set of authoritative package values, not a mixture of old and new fields.

## Relationships with other modules

### `booking-lifecycle`

- Consumes the authoritative active package configuration at confirmation.
- Derives price, currency, duration, activation state, package revision, and package identity server-side; never trusts client-supplied displayed values.
- Owns the immutable confirmed-booking snapshot and uses it to preserve booking history.
- Must atomically revalidate booking availability without assuming final simultaneous capacity; package duration is one input but does not define the capacity model.

### `operating-calendar`

- Has no runtime/domain dependency from `service-catalog` to `operating-calendar`.
- A later booking/scheduling boundary may combine package duration with operating-calendar availability. This specification does not define scheduling or capacity.

### `admin-operations` and `admin-access`

- Later `admin-operations` exposes protected catalogue mutations and applies authorization through `admin-access`.
- `service-catalog` remains independent of those runtime/domain modules and enforces only its own domain-validity invariants.

### `audit-trail`

- `service-catalog` has no runtime dependency on `audit-trail` or `admin-access`. It defines domain mutation invariants only.
- A future `admin-operations` orchestration boundary applies authentication/authorization, required durable audit confirmation, and catalogue mutation while preserving the consistency guarantees required by `SPEC-audit-trail.md`.
- Financial or operationally high-impact changes—price/currency, duration, activation/deactivation, and any future approved deletion/restoration workflow—require durable audit confirmation through that later orchestration. They must not be reported successful unless their required audit event has durable acceptance.
- Name/description changes require an audit event because they modify public catalogue content, but name/description-only changes do not require durable audit confirmation by default. They may proceed under the lower-risk audit failure policy unless later threat modeling identifies higher impact.
- A name/description change bundled with a high-impact change inherits the stronger durable-audit requirement.
- Audit events use minimized package identifiers and allowlisted change descriptors. They must not serialize complete package records, request bodies, response bodies, credentials, tokens, or PII.

## Technology, commands, project structure, code style, and testing

- **Tech stack:** Deferred. No framework, database, ORM, cache, cloud, currency/payment provider, concurrency control, or versioning mechanism is selected.
- **Commands:** Not applicable. This specification defines domain policy and creates no executable artifact.
- **Project structure:** Deferred. No implementation layout is selected.
- **Code style:** Not applicable. No application code or interface binding is selected.
- **Testing and verification expectations:** Future implementation must verify server-authoritative price/duration/status; rejection of client price/duration overrides; field validation; active-only public projection; no PII in the catalogue; protected mutation boundary behavior; deactivation effects; confirmed-booking snapshot behavior after each field change; stale/concurrent mutation handling; coherent confirmation snapshots; audit-event coverage and durable-audit failure behavior for high-impact changes; and safe rendering of customer-facing text. Tests and demos use synthetic data.

## Acceptance criteria

- [ ] The package model has a stable non-secret/non-authorizing identifier, name, description, price, explicit `BRL` currency, estimated duration, active/inactive state, and server-controlled per-package `packageRevision`.
- [ ] The server is authoritative for every booking-relevant package value and snapshot creation; a client cannot set arbitrary price, currency, duration, status, revision, or package snapshot.
- [ ] Public catalogue reads expose only active safe projections needed for booking and no administrative/internal data or PII.
- [ ] Price is non-negative and unambiguous; duration is positive and bounded; malformed or invalid package data is rejected server-side.
- [ ] Protected mutations remain outside this module's authorization design and are later mediated by `admin-operations` plus `admin-access`.
- [ ] Deactivation prevents new selection/confirmation but does not corrupt or invalidate already-confirmed bookings.
- [ ] Successful confirmation preserves the immutable, booking-facing package contract of `packageId`, `packageRevision`, name, description, confirmed price, confirmed currency, and confirmed estimated duration; later catalogue edits never silently rewrite it.
- [ ] Stale commercial terms between customer review and confirmation are detected server-side; the customer must review current authoritative terms again, duration changes revalidate availability, inactive packages fail safely, and confirmation/snapshot use one coherent authoritative package revision.
- [ ] Concurrent/stale mutations cannot silently overwrite configuration or cause a booking to receive mixed package values.
- [ ] Price/currency, duration, activation/deactivation, and later deletion/restoration changes are orchestrated with durable audit confirmation; name/description changes emit an audit event and use lower-risk audit failure behavior unless bundled with a high-impact change; audit records contain only minimized/allowlisted data.
- [ ] MVP packages are not hard-deleted through normal administrative workflows; inactive packages are retained for authorized historical reference and never publicly selectable.
- [ ] The module stores no PII and does not assume a final simultaneous vehicle-capacity model.

## Boundaries

### Always

- Treat server-side catalogue configuration as authoritative for new bookings.
- Validate package data server-side and expose only active safe public projections.
- Preserve the immutable confirmed-booking package contract of `packageId`, `packageRevision`, name, description, price, currency, and estimated duration.
- Detect stale reviewed package terms server-side and require renewed review before confirmation; use one coherent authoritative revision for confirmation and snapshot creation.
- Prevent deactivation from corrupting or invalidating already-confirmed bookings.
- Require later orchestration to obtain durable audit confirmation for high-impact financial/operational changes and use minimized audit data.
- Keep `service-catalog` independent of `admin-access` and `audit-trail` at runtime and free of PII.

### Ask First

- Choosing exact monetary representation and rounding, price-change communication, or a commercial cancellation/change workflow.
- Defining employee catalogue permissions, public duration visibility, or inactive-package administrative visibility.
- Choosing a persistence, versioning, concurrency, cache, framework, database, ORM, cloud, or payment/currency-provider mechanism.

### Never

- Trust a client-submitted price, duration, currency, activation state, displayed package data, or package snapshot as authoritative.
- Trust a client-submitted revision/quote reference or allow it to override server-authoritative package state or snapshot creation.
- Use a package identifier as a secret, public authorization capability, or substitute for protected mutation authorization.
- Expose inactive packages, internal metadata, audit data, or PII through public catalogue reads.
- Silently rewrite confirmed bookings when a package price, duration, name, description, or status changes.
- Silently confirm a booking using changed commercial/operational terms that the customer has not reviewed.
- Deactivate a package in a way that corrupts or invalidates existing confirmed bookings without a separately approved business workflow.
- Hard-delete an MVP package through an ordinary administrative workflow.
- Add PII, choose implementation technology, or assume final simultaneous vehicle capacity in this module.

## Open questions requiring human approval

1. What exact monetary representation and rounding rules preserve BRL commercial correctness?
2. Is a description required, and should estimated duration be publicly displayed to customers?
3. What business workflow applies if a confirmed booking must change package, price, duration, or be cancelled after a catalogue edit?
4. What stale-update/concurrency behavior and package revision presentation are appropriate once architecture is selected?
