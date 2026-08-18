# Spec: operating-calendar

## Status

Draft for human review. This is the Phase 1 specification for `operating-calendar` only. It does not authorize planning, implementation, or specification of `booking-lifecycle`, `public-booking-flow`, or another module.

## Objective

Define the authoritative business-calendar rules that determine when the car wash is operationally open or unavailable. The module evaluates calendar eligibility for a proposed local service interval; it does not generate final bookable slots, select packages, decide booking capacity, or confirm bookings.

`operating-calendar` is a PII-free domain capability. It has no runtime/domain dependency on `admin-access`, `audit-trail`, or `service-catalog`. Protected mutations are later orchestrated by `admin-operations`, `admin-access`, and `audit-trail`.

## Scope

This specification defines:

- An explicit business timezone, recurring weekly schedule, date-specific overrides, closures, exceptional opening hours, and temporary-unavailability blocks.
- Rule precedence, interval semantics, validation, calendar revision, concurrency, safe public projections, and authoritative eligibility evaluation.
- Boundaries with future booking, public-booking, administration, and audit orchestration.

## Non-goals

- Final booking availability, slot generation, slot increments, resource allocation, simultaneous vehicle capacity, or atomic booking confirmation.
- Package selection, package duration storage, customer/vehicle/booking data, PII, payment, or notification behavior.
- Administrative authentication/authorization or direct audit persistence.
- Choosing a framework, database, ORM, calendar/timezone library, cache, queue, cloud provider, transaction mechanism, slot-generation algorithm, capacity model, or revision encoding.
- Automatically importing Brazilian holidays or using an external holiday provider.

## Proposed calendar domain model

| Concept | Purpose and invariant |
|---|---|
| `businessTimezone` | Initial MVP configuration is the explicit named authoritative IANA timezone `America/Fortaleza`, with real timezone rules for all calendar interpretation. Customer browser timezone is never authoritative for opening hours. The configured timezone remains changeable only through the approved controlled migration boundary. |
| `calendarRevision` | Server-controlled revision for the business calendar as a coherent rule set. It detects stale administrative changes and supports coherent current-state revalidation. Its representation is deferred. |
| `weeklySchedule` | Default recurring operating windows keyed by local day of week. A local day may have zero, one, or multiple separate windows. |
| `operatingWindow` | A local-time interval during which the business is normally open on a given local day. For MVP, it must not cross midnight. |
| `dateOverride` | Unique date-specific replacement for the recurring weekly schedule: either `CLOSED` or an explicit complete set of exceptional operating windows. It is never additive/merged with the weekly schedule. |
| `temporaryUnavailability` | A bounded, same-local-date block subtracted from otherwise resulting operating windows. Future internal notes/reasons are non-public and outside the public projection. |
| `holiday` | A business-configured date represented as a `CLOSED` override or another explicit approved override. Holidays have no effect unless configured by the business. |

The calendar has no customer, vehicle, account, CPF, phone, email, address, licence plate, tracking token, credential, booking payload, or other PII.

## Business timezone

- Calendar rules, dates, local day-of-week, opening windows, overrides, and eligibility evaluation must use one explicit named authoritative `businessTimezone` with real timezone rules, not merely a fixed UTC offset.
- Customer browser timezone, device locale, and client-side date arithmetic are never authoritative for business opening hours.
- The eventual implementation must use timezone-aware date/time semantics, preserve local-date meaning across timezone-rule/offset transitions, and explicitly handle ambiguous or nonexistent local times if the configured timezone experiences offset transitions.
- Initial MVP configuration is `America/Fortaleza`, appropriate to initial deployment/use in Paraíba. It is a named IANA timezone, not a fixed UTC offset, and does not impose a city/location product requirement. The timezone remains configurable only under the controlled change boundary below.

## Recurring weekly schedule

- `weeklySchedule` defines default operating windows for each local day of week in `businessTimezone`.
- A local day may contain multiple separate windows, such as morning and afternoon service periods. The domain must not assume one continuous opening interval.
- A local day may have no recurring windows and is then closed by default unless a date-specific exceptional opening override applies.
- For MVP, cross-midnight/overnight operating windows are rejected. A future approved specification may add them if the business needs them.

## Date-specific overrides, closures, and temporary unavailability

- At most one `dateOverride` exists for a local calendar date. It replaces the recurring schedule for that date and is either `CLOSED` or an explicit complete set of exceptional operating windows; it is never additive/merged with the recurring schedule.
- For MVP, a planned/configured full-day closure or holiday is represented canonically as a `CLOSED` date override. `temporaryUnavailability` is not a second canonical representation for a whole closed date.
- If a future emergency workflow closes a whole date temporarily, it must create/use the authoritative `CLOSED` date override through appropriate administrative orchestration rather than introduce a second eligibility representation.
- A partial-day closure is represented by temporary unavailability that subtracts a bounded interval from resulting operating windows.
- A partial temporary-unavailability interval must start and end on the same authoritative business-local date. Multi-day/cross-midnight unavailability is represented as separate per-date configuration until a future specification adds richer semantics.
- Holidays affect availability only when represented by approved business configuration. The system must not infer holidays automatically.
- Internal reasons/notes, if later supported, are not public data and must not be included in public projections.

## Rule precedence

The following deterministic precedence model is approved:

1. The recurring weekly schedule defines the default operating windows for a local calendar date.
2. At most one date-specific override replaces that date's recurring schedule with either `CLOSED` or an explicit complete set of exceptional windows.
3. Temporary-unavailability blocks are subtracted from the resulting windows.

This produces one resulting set of eligible calendar windows for the local date and avoids ambiguous combinations of weekly rules, holidays, exceptional openings, and closures. If no resulting window contains the proposed service interval, that interval is not calendar-eligible.

## Interval semantics and validation

- All intervals use approved half-open semantics, `[start, end)`. Adjacent intervals such as `[09:00, 12:00)` and `[12:00, 17:00)` are allowed and do not overlap ambiguously.
- For a resulting operating window `[08:00, 12:00)`, a 30-minute service interval `[11:30, 12:00)` is calendar-eligible, while `[11:45, 12:15)` is not. The complete service interval must fit inside one resulting eligible operating window.
- Interval evaluation is timezone-aware and uses authoritative local date/time interpretation in `businessTimezone`.
- Invalid, zero-length, reversed, malformed, out-of-range, or timezone-invalid intervals must be rejected server-side.
- Ambiguous overlapping configured operating windows are rejected rather than silently canonicalized. Adjacent non-overlapping windows are valid under the half-open convention.
- Duplicate/overlapping date overrides for the same local date are rejected because at most one override may exist. Temporary-unavailability blocks use union semantics, so overlapping blocks do not create ambiguous eligibility.
- For MVP, an operating window that crosses local midnight is rejected. This avoids implicit overnight-date semantics.

## Temporary-unavailability semantics

- Temporary-unavailability blocks subtract time from already-resolved operating windows; they never add or create operating time.
- A block may partially intersect an operating window. For example, subtracting `[10:00, 10:30)` from `[08:00, 12:00)` results in `[08:00, 10:00)` and `[10:30, 12:00)`.
- A block outside otherwise open time has no effect on eligibility and must not create new operating time.
- Overlapping temporary-unavailability blocks have the deterministic effect of their union. Their representation/canonicalization mechanism remains deferred.

## Server authority and calendar eligibility

- The server is authoritative for timezone, recurring rules, date-specific overrides, closures, temporary unavailability, calendar revision, and eligibility evaluation.
- Client-provided dates/times must be validated and interpreted against current authoritative business-calendar rules.
- A public/calendar client may receive a non-authoritative revision/reference later for stale detection, but cannot override calendar state or eligibility with cached data.
- `operating-calendar` may answer whether a proposed local interval is fully contained within the resulting eligible operating windows and does not intersect a closure/unavailability block.
- Calendar eligibility is not final booking availability and does not reserve a time.

## Package duration and booking boundaries

- Authoritative package duration comes from `service-catalog` through the later booking-confirmation boundary. `operating-calendar` does not select a package or trust a client-submitted duration.
- For a proposed booking interval to be calendar-eligible, the complete required service interval must fit within one resulting eligible operating window and must not intersect a closure/unavailability block.
- `booking-lifecycle` later combines authoritative package duration, calendar eligibility, existing confirmed/in-progress bookings, concurrency, resource/capacity rules, and atomic confirmation to determine final bookability.
- `operating-calendar` does not decide final simultaneous vehicle capacity, generate final slots, or hardcode 15/30/60-minute increments.

## Public projection and public-booking-flow relationship

- `public-booking-flow` may consume only calendar/availability information necessary for the booking experience.
- Public consumers receive only the minimum derived calendar information approved by the later public-booking contract. Raw administrative calendar configuration is not public merely because it is non-PII.
- Public projections exclude internal rule structure, notes/reasons, calendar revision/concurrency internals unless a future approved non-authoritative stale-detection contract requires them, audit details, implementation details, security data, and PII.
- A date/time shown earlier to a customer is neither a reservation nor a guarantee.
- If calendar configuration changes before booking confirmation, `booking-lifecycle` must revalidate against the current coherent authoritative calendar state. A stale selection that is no longer calendar-eligible must fail safely and require the customer to select/review availability again.

## Existing confirmed bookings and calendar changes

- A calendar mutation must not silently rewrite, cancel, move, or invalidate an already-confirmed booking.
- If a closure or temporary-unavailability block overlaps an existing confirmed booking, the existing booking record is preserved and the conflict must be surfaced to a later authorized administrative workflow.
- A calendar mutation that creates overlap with confirmed bookings must make the conflict detectable/surfaceable to that future authorized workflow. Calendar mutation and booking-conflict resolution are separate operations.
- Resolving, rescheduling, or cancelling an affected booking requires an explicit, separately authorized workflow. No automatic booking resolution occurs inside `operating-calendar`.

## Calendar revision and concurrent mutation expectations

- `calendarRevision` is the approved MVP revision scope: one server-controlled revision for the business calendar's coherent rule set. It is appropriate because recurring rules, date overrides, and unavailability interact in one eligibility result.
- Every accepted eligibility-affecting mutation advances or otherwise changes the authoritative `calendarRevision`, including recurring schedule changes; date-override creation/change/removal; holiday/closure changes; exceptional operating-window changes; temporary-unavailability creation/change/removal; and an authoritative business-timezone change if that is later permitted.
- Stale administrative calendar mutations must be detectable; concurrent changes must not silently overwrite each other, mix incompatible old/new rules, or produce a partial invalid calendar state.
- Booking confirmation must revalidate against one coherent current authoritative calendar revision. It must not combine different rule revisions.
- Representation, optimistic locking, transaction, persistence, and revision encoding are deferred. A future architecture may introduce narrower revisions only if it preserves these coherent-state invariants and is justified by complexity/operational need.

## Business-timezone change safety

- Changing `businessTimezone` after production calendar data or bookings exist is not an ordinary low-risk configuration edit because it can reinterpret existing local calendar rules and bookings.
- Such a change requires an explicitly approved migration/administrative workflow and impact analysis before execution.
- It must not silently reinterpret already-confirmed bookings or existing calendar configuration. The migration mechanism remains deferred.

## Administrative mutation and audit boundary

- `operating-calendar` defines valid domain state and mutation invariants; it does not authenticate administrators, authorize mutations, or persist audit events.
- Future `admin-operations` orchestrates `admin-access` authorization, required durable audit confirmation, and calendar mutation while preserving `SPEC-audit-trail.md` consistency guarantees.
- Recurring working hours, holidays, full/partial closures, exceptional opening windows, and temporary unavailability are high-impact operational mutations. They require durable audit confirmation and must not be reported successful unless required audit event durable acceptance is achieved by the future orchestration.
- Audit events use minimized calendar/resource identifiers and allowlisted change descriptors; they must not contain complete calendar records, request bodies, credentials, tokens, PII, or internal notes.

## Technology, commands, project structure, code style, and testing

- **Tech stack:** Deferred. No framework, database, ORM, calendar/timezone library, cache, queue, cloud provider, transaction mechanism, slot-generation algorithm, capacity model, or revision mechanism is selected.
- **Commands:** Not applicable. This specification defines a domain contract and creates no executable artifact.
- **Project structure:** Deferred. No implementation layout is selected.
- **Code style:** Not applicable. No application code or interface binding is selected.
- **Testing and verification expectations:** Future implementation must verify `America/Fortaleza` initial configuration; recurring schedules; multiple daily windows; `CLOSED` and exceptional-opening overrides; full/partial temporary unavailability; half-open boundaries; invalid/overlapping configuration rejection; timezone behavior and offset-transition edge cases where applicable; authoritative server evaluation; stale customer selection; stale/concurrent administrative updates; coherent-revision revalidation; existing confirmed bookings overlapping a later calendar change; durable-audit failure behavior through future orchestration; safe public projections; and absence of PII. Tests and demos use synthetic data.

## Acceptance criteria

- [ ] Initial MVP business timezone is the explicit named IANA timezone `America/Fortaleza`, with real timezone rules; browser timezone is never authoritative, local-date meaning is preserved across rule/offset transitions, and offset-transition behavior is explicitly handled where applicable.
- [ ] Weekly recurring schedules support zero, one, or multiple local operating windows per day.
- [ ] At most one date-specific override per local date completely replaces weekly rules as `CLOSED` or explicit exceptional windows; temporary unavailability is subtracted afterward according to the approved precedence model and never creates operating time.
- [ ] Holidays affect availability only through approved business configuration; no automatic holiday inference/provider is used.
- [ ] Approved half-open `[start, end)` semantics allow adjacent windows and require the complete service interval to fit in one resulting window; overlapping operating windows, invalid/reversed/zero-length/malformed configuration, and MVP cross-midnight windows are rejected server-side.
- [ ] Server-authoritative eligibility requires the complete authoritative service interval to fit in one resulting window and avoid closures/unavailability.
- [ ] Calendar eligibility is not final availability, capacity decision, slot generation, or reservation; final bookability remains with `booking-lifecycle`.
- [ ] Stale customer date/time selection is revalidated against current coherent calendar state and fails safely when no longer eligible.
- [ ] Calendar changes preserve confirmed booking records and surface conflicts for separately authorized resolution.
- [ ] The approved MVP `calendarRevision` changes for every eligibility-affecting mutation, detects stale/concurrent mutation, and supports coherent booking revalidation without silent lost updates or mixed rule state.
- [ ] Changing business timezone after production data/bookings exist requires an explicitly approved migration/administrative workflow and impact analysis; it never silently reinterprets confirmed bookings or existing calendar configuration.
- [ ] High-impact calendar mutations are later orchestrated with durable audit confirmation; `operating-calendar` itself has no runtime dependency on `admin-access` or `audit-trail` and persists no audit event.
- [ ] Public consumers receive only later-approved minimum derived calendar information; raw administrative rules, notes, revisions, audit details, security data, and PII remain non-public by default.

## Boundaries

### Always

- Interpret calendar rules and eligibility in the authoritative business timezone.
- Validate calendar mutations server-side; reject invalid, ambiguous, overlapping, or cross-midnight MVP windows.
- Apply the approved deterministic precedence and half-open interval semantics; subtract the union of temporary-unavailability blocks without creating operating time.
- Treat calendar data shown to a customer as non-reserving and revalidate it at booking confirmation.
- Preserve existing confirmed bookings when calendar changes introduce a conflict; require explicit authorized resolution.
- Treat post-production business-timezone change as an approved migration with impact analysis, not an ordinary calendar edit.
- Keep `operating-calendar` PII-free and independent of `admin-access`, `audit-trail`, and `service-catalog` at runtime.
- Require future orchestration to obtain durable audit confirmation for high-impact operational changes.

### Ask First

- Defining public calendar projection detail, internal notes/reasons and their authorization boundary, or inactive/temporary-unavailability management workflow.
- Choosing revision representation, concurrency, persistence, transaction, cache, queue, calendar/timezone library, framework, database, ORM, cloud, slot-generation, or capacity mechanism.
- Defining a workflow to resolve calendar conflicts with already-confirmed bookings.

### Never

- Treat browser timezone, client-cached rules, or client-provided eligibility as authoritative.
- Generate final bookable slots, reserve a time, decide capacity, or hardcode slot increments in this module.
- Automatically import/infer holidays or automatically cancel, move, or invalidate an existing confirmed booking after a calendar change.
- Allow invalid, zero-length, reversed, malformed, ambiguous overlapping, or cross-midnight MVP windows; use temporary unavailability as a second canonical full-day closure representation.
- Persist audit events, authenticate/authorize administrators, add PII, or expose notes/audit/security/internal revision data through public projections.
- Treat a post-production business-timezone change as an ordinary low-risk edit or silently reinterpret confirmed bookings/calendar rules.
- Choose technology or implement calendar/slot/capacity behavior under this specification.

## Open questions requiring human approval

1. What public calendar/availability detail should be shown before final booking availability is calculated?
2. What workflow and authority resolve a closure/unavailability conflict with an already-confirmed booking?
3. Are internal reasons/notes required for calendar blocks, and who may see them?
