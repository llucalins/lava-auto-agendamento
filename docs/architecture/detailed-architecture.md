# Detailed Application Architecture

## Status and authority

**Status:** Proposed for human review. This is the detailed architecture for the accepted Phase 1 specifications and ADRs; it authorizes neither implementation nor a provider selection.

It refines, but does not replace, the approved specifications, [Capability Map](../../CAPABILITY_MAP.md), [threat model](../security/threat-model.md), and ADRs [0001](adr/0001-typescript-nextjs-modular-monolith.md) through [0005](adr/0005-durable-audit-and-privacy-lifecycle.md). A conflict with those sources is a review blocker. None was found while drafting this document.

## 1. Baseline and implementation-level choices

The application is a TypeScript modular monolith using Next.js App Router on the current supported Node.js LTS release. It is one logical deployable application, but every correctness, authorization, session, audit, tracking, and rate-limit decision that matters is persisted or coordinated through PostgreSQL. A second Node process must produce the same correct result.

### Selected tools

| Decision | Selected tool/category | Verified fact | Architectural inference and rationale | Rejected alternative category |
|---|---|---|---|---|
| PostgreSQL access | `pg` / node-postgres with a thin repository layer | Its documentation supports parameterized queries and requires one checked-out client for all statements in a transaction ([queries](https://node-postgres.com/features/queries), [transactions](https://node-postgres.com/features/transactions)). | Its deliberately low-level API leaves PostgreSQL ranges, exclusion constraints, isolation levels, row locks, and SQL projections available for integrity-critical operations. Repositories own SQL and transaction boundaries; callers do not. | A heavy ORM as the correctness boundary. An ORM may be introduced only if it cannot conceal or restrict native SQL needed here; none is selected. |
| Migrations | `node-pg-migrate`, invoked only by a migration authority | Current documentation supports TypeScript migration files, advisory migration locking, transactional migrations by default, and explicit SQL where needed ([TypeScript](https://salsita.github.io/node-pg-migrate/faq/typescript), [migrations](https://salsita.github.io/node-pg-migrate/migrations/)). | It fits the Node/TypeScript baseline while allowing reviewed native PostgreSQL DDL for range/exclusion constraints, privileges, and functions. Migrations are versioned, forward-only in production unless an explicitly safe rollback is approved. | Manual schema edits and an ORM-owned migration workflow that cannot express/review native PostgreSQL requirements. |
| Runtime boundary validation | Zod | Zod is a TypeScript-first schema-validation library with parsing/validation APIs ([official documentation](https://zod.dev/)). | Validate request bodies, headers, cookies, route parameters, environment configuration, OIDC callback/token claims, and any external response. Infer TypeScript types only as a convenience; types never establish trust. | TypeScript-only validation, handwritten ad-hoc validators, or validation embedded in domain modules. |
| Automated tests | Vitest for unit/API/repository tests; Playwright for browser/end-to-end security flows | Vitest runs TypeScript tests directly and documents that execution is not type checking ([Vitest](https://vitest.dev/guide/learn/writing-tests)). Playwright supplies isolated browser contexts ([Playwright isolation](https://playwright.dev/docs/browser-contexts)). | This gives fast TypeScript tests and real-browser coverage for cookies, redirects, CSRF, cache headers, and no-PII URLs. PostgreSQL integration tests use a real isolated PostgreSQL database, never a mock, for constraints and concurrent transactions. | A browser-less-only test strategy; mocks for PostgreSQL concurrency; a framework-specific test runner as the only layer. |
| OIDC client | Provider-neutral OAuth 2.0/OIDC Authorization Code + PKCE client; select `openid-client` at implementation unless current provider verification disproves compatibility | `openid-client` supports OIDC discovery and Authorization Code flow with PKCE and is actively maintained in v6 ([official repository](https://github.com/panva/openid-client)). | A small standards client avoids a provider SDK becoming the local authorization model. Exact provider interoperability, claims, MFA assurance mapping, pricing, DPA, and region remain gates. | A provider-specific application SDK, implicit flow, or treating an external access token as application authorization. |

**Current-version verification:** Node’s official download page currently lists Node 24 as LTS; the implementation pins a supported LTS line and reviews it at build/deploy time rather than encoding a version in this document ([Node releases](https://nodejs.org/en/download/current)). Next.js treats `cookies()` as a request-time Dynamic API and documents its App Router cache behavior ([cookies](https://nextjs.org/docs/app/api-reference/functions/cookies), [caching](https://nextjs.org/docs/app/guides/production-checklist)). These are verified facts; the route policy below is the architectural inference.

## 2. Module and codebase boundaries

Privacy governance is cross-cutting policy, **not** a runtime module or database service. Runtime dependency directions remain exactly those in the Capability Map:

```text
audit-trail
admin-access                 service-catalog          operating-calendar
       \                         |                         /
                     booking-lifecycle
              /                                 \
public-booking-flow                     public-status-tracking
                         \
                        admin-operations
```

`booking-lifecycle` may call catalogue, calendar, and audit capabilities; public and administrative modules orchestrate only. `service-catalog` and `operating-calendar` never depend on admin access or audit. No route handler, page, server action, or repository is a new domain authority.

Proposed layout (names are architecture boundaries, not files to create now):

```text
src/
  app/                       # thin App Router pages and Route Handlers
    (public)/booking/         # public booking UI
    (public)/tracking/        # neutral proof and status UI
    (admin)/admin/            # protected admin UI
    api/                      # thin transport adapters only
  server/
    shared/                   # IDs, time, money, errors, runtime schemas
    persistence/              # pool, transaction runner, repository contracts
    capabilities/
      audit-trail/
      admin-access/
      service-catalog/
      operating-calendar/
      booking-lifecycle/
      public-booking-flow/
      public-status-tracking/
      admin-operations/
    security/                 # CSRF, cookie policy, OIDC protocol adapter,
                              # authorization gate, observability allowlist
  contracts/                  # transport DTOs and stable domain enums only
database/                     # reviewed migration source, not application code
tests/                        # integration/concurrency/e2e suites
```

`server/**` is server-only. Client components receive only explicitly projected DTOs. The shared layer contains non-PII primitives (`BookingStatus`, `ServiceMode`, centavo amount, IANA-zone handling, stable error code) and cannot import capabilities. Runtime schemas live at the transport/external boundary; internal domain commands use validated typed inputs. Repositories return narrow projections, never aggregates by default.

## 3. PostgreSQL logical model

All timestamps that represent a real instant use `timestamptz`; calendar interpretation uses the configured named IANA timezone, initially `America/Fortaleza`. The calendar configuration stores the configured zone and a revision; a browser zone is never input to authority. Availability returns a server-authoritative selectable instant/interval together with business-local display data. If a later configured zone has DST, a client-supplied local wall-clock value in a repeated interval is rejected unless it is bound unambiguously to that server-generated instant/option; a value in a nonexistent local-time gap is rejected. The server never silently selects an offset. Duration and overlap checks always use authoritative instants, and a production timezone change remains a controlled migration/impact-analysis operation.

| Area | Authoritative entities and major fields | Purpose and relationships |
|---|---|---|
| Catalogue | `service_packages(package_id, current_revision, state, created_at, updated_at)`; `service_package_revisions(package_id, revision, name, customer_description, included_services_representation, price_centavos, currency, duration_seconds, created_at)` | Immutable revisions support active/inactive state and package snapshots. A package points to its current revision; confirmed bookings reference a copied immutable snapshot, not a mutable package revision. |
| Calendar | `operating_calendars(calendar_id, timezone, calendar_revision)`; `weekly_operating_windows`; `calendar_date_overrides`; `temporary_unavailability` | One authoritative configured business calendar. Windows are local business time; override/unavailability records are revisioned through the parent. The approved precedence and no-cross-midnight MVP rule remain in the calendar capability. |
| Booking core | `bookings(booking_id, booking_revision, status, service_start, service_end, service_mode, intended_payment_method, terminal_transition_at, confirmation_intent_id, created_at)`; `booking_package_snapshots(booking_id, package_id, package_revision, name, description, included_services, price_centavos, currency, duration_seconds)` | Owns lifecycle state, immutable service terms, `[start,end)` interval, payment intent, and source confirmation intent. It holds no mutable capacity calculation supplied by a client. |
| Booking PII | `booking_customer_vehicle_pii(booking_id, full_name, phone_whatsapp, email_nullable, cpf, vehicle_model, licence_plate, vehicle_colour, pickup_address_nullable, pii_lifecycle_state, anonymized_at)` | One-to-one PII boundary separated from normal booking projections and retention metadata. Application/database privilege boundaries prevent broad joins. |
| Capacity | `capacity_units(capacity_unit_id, state, ordinal, created_at)`; `capacity_allocations(allocation_id, booking_id, capacity_unit_id, service_interval, consumes_capacity, allocation_state, released_at, released_reason)` | Capacity unit cardinality is configuration. Initially exactly one active unit is configured. Allocations hold their own authoritative consumption state and interval, avoiding a constraint predicate that relies on a joined booking status. |
| Idempotency | `confirmation_intents(operation_scope, intent_key, request_fingerprint, state, booking_id_nullable, outcome_code, outcome_projection, completed_at, expires_at)` | A unique public booking-confirmation intent preserves result recovery even after later package/calendar changes. Only final outcomes persist; the projection contains no raw PII or tracking raw credential. |
| Admin identity and authorization | `staff_members`; `admin_identities(admin_id, issuer, subject, account_state, authorization_version)`; `roles`; `permissions`; `role_permissions`; `admin_role_assignments`; `authorization_subject_versions` | Issuer+subject identifies a person, not their authority. Roles express OWNER/EMPLOYEE relationships and permissions; the current server-side policy determines access. Version rows coordinate final sensitive reads and security reductions. |
| Admin session and OIDC transient state | `admin_sessions(session_verifier, admin_id, authorization_version_at_issue, assurance, authenticated_at, assurance_expires_at, idle_expires_at, absolute_expires_at, rotated_from, revoked_at, last_seen_at)`; `oidc_login_transactions(state_verifier, nonce_verifier, pkce_verifier, redirect_target, expires_at, consumed_at)` | Opaque cookie values are verified server-side. OIDC protocol state is short-lived and single-use; external tokens are not stored as application authorization evidence. |
| Public tracking | `tracking_issuances(booking_id, state, credential_id_nullable, attempted_at, activated_at, issuance_version)`; `tracking_credentials(credential_id, booking_id, credential_version, verifier_key_version, credential_verifier, state, terminal_expires_at, issued_at, revoked_at, replaced_by)`; `tracking_sessions(session_verifier, credential_id, credential_version, expires_at, revoked_at)` | A credential is a separate bearer capability. Issuance is a uniquely recorded post-confirmation effect; verifier-only storage and version binding allow revocation/replacement/expiry to invalidate sessions. |
| Audit and lifecycle | `audit_events(event_id, occurred_at, event_type, outcome, schema_version, actor_ref, target_ref, field_ref_nullable, correlation_id, idempotency_ref_nullable, authorization_context_ref_nullable)`; `retention_executions`; `fiscal_records` (separate boundary) | Append-only minimized audit events; retention executions record class/count/outcome, not deleted values. Fiscal records have their own purpose and fields, not a copy of whole operational PII. |

### Sensitive data projections and retention

| Field/group | Why stored | Normal list/detail | Who may read | Retention |
|---|---|---|---|---|
| Full name, vehicle model/colour | operational recognition | list and authorized detail, as approved | authorized operational booking readers | active; terminal 12 months then delete/anonymize absent another purpose |
| Phone/WhatsApp, optional email, full plate | service communication/vehicle delivery | authorized detail only | explicit normal-detail permission | same operational lifecycle |
| CPF | approved product field; production purpose/basis is still a gate | neither normal list nor detail | only explicit CPF reveal permission after durable audit and final gate | same operational lifecycle; no audit/log/URL exposure |
| Pickup address | required only for `PICKUP_REQUESTED` delivery | neither normal list nor detail | only explicit address reveal permission after durable audit and final gate | remove from material booking state when mode becomes `DROP_OFF`; otherwise same lifecycle |
| Tracking verifier/session verifier | narrow tracking authorization | never a business projection | verifier functions only | credential lifecycle; exact post-expiry verifier retention is unresolved |
| Audit refs | accountability | audit readers only when separately authorized | audit-reader policy | minimized audit retained 24 months |

CPF is ordinary personal data under LGPD and a project-defined high-risk PII field, not statutory sensitive personal data. Its presence here does not establish a universal legal/fiscal requirement or a lawful basis.

## 4. Integrity rules by enforcement layer

### Database constraints

- Enumerated/check-constrained values: booking status (`SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), service mode (`DROP_OFF`, `PICKUP_REQUESTED`), payment method (`PIX`, `CASH`, `CREDIT_CARD`, `DEBIT_CARD`), package state, allocation/credential/session states, and fixed currency `BRL`.
- Positive bounded `bigint` centavos for price; bounded duration; non-null start/end with `start < end`; `tstzrange(start,end,'[)')` for every allocation. JavaScript values are validated as safe integers at the JSON boundary; persistence stays within PostgreSQL `bigint` bounds.
- Foreign keys, immutable composite package revision identity, one current package revision pointer, calendar and booking revision non-null checks, and a unique immutable `confirmation_intent_id` on a booking.
- Pickup conditionality is enforced by a protected booking write path plus a deferred PostgreSQL constraint trigger, not an ordinary cross-table `CHECK`: its transaction-final state must have a non-null pickup address for `PICKUP_REQUESTED` and no pickup-address material state for `DROP_OFF`. A mode change to `DROP_OFF` clears/removes the address in that same transaction. Application validation repeats the rule but is not its sole enforcement; runtime roles cannot make broad direct writes that bypass the guarded path. PostgreSQL integration tests must reject invalid final combinations and prove that a `DROP_OFF` transition clears the address atomically.
- A GiST exclusion constraint (with the PostgreSQL range and equality operator support required by the final DDL) on `(capacity_unit_id WITH =, service_interval WITH &&)` **where `consumes_capacity = true`**. This permits `[)` back-to-back intervals and rejects overlap within one unit. An allocation state/change, not a joined booking status, controls the predicate. In the N=1 model, a partial unique constraint permits exactly one consuming allocation per booking.
- A partial unique constraint makes at most one tracking credential active per booking. `tracking_issuances.booking_id` is unique and state/check constrained, and unique `(credential_id, credential_version)` plus session-to-version foreign-key/check relationships prevent an old credential version from authorizing a current session.
- Unique `(operation_scope, intent_key)` plus immutable request fingerprint binding; unique OIDC state; unique issuer/subject; opaque session-verifier uniqueness.
- Append-only audit table permissions: runtime can insert through a narrow audit writer but cannot update/delete audit rows; migration authority owns schema changes. Audit event uniqueness/idempotency is scoped to the originating operation.

### Application validation

- Zod validates untrusted input format, size, canonical enum value, expected revision token, date/time expression, and field conditionality before a domain command. It does not decide calendar eligibility, active package state, price, duration, capacity, authorization, or MFA assurance.
- Catalog/calendar capabilities validate their approved business semantics. Booking lifecycle calculates end time from current authoritative duration and validates calendar eligibility. Public availability contains only minimal customer-facing dates/times.
- Canonical confirmation material is normalized deterministically (including identifiers, service mode/address state, customer/vehicle values, and intended payment method) before keyed fingerprinting. No client price, duration, end time, currency, capacity calculation, or authoritative revision is accepted.

### Transactional invariants

- Confirmation rechecks package current revision/state, calendar current revision/eligibility, computed interval, capacity allocation, immutable snapshot, initial `SCHEDULED`, and idempotency outcome in one recoverable PostgreSQL outcome.
- Status transition and allocation mutation are one transaction. `CANCELLED` flips its active allocation to non-consuming exactly once only after valid cancellation; rejected, failed, or ambiguous cancellation rolls back both. `COMPLETED` preserves the historical allocation row and does not delete it.
- A high-impact administrative mutation and its required minimized audit event commit together. A final sensitive projection is conditional on current authorization in its own strongly consistent read boundary after the audit acceptance boundary.
- Package, calendar, booking, and authorization-version writes compare the current revision/version and reject stale writes; no silent overwrite.

The final schema exposes lifecycle writes through guarded PostgreSQL functions/triggers: only a valid booking lifecycle transition may create or change a capacity allocation; it checks the resulting booking/allocation pair is coherent before commit. The application runtime is granted execution on those guarded paths, not broad direct allocation mutation. The guard enforces one consuming allocation for each N=1 `SCHEDULED`/`IN_PROGRESS` booking, none for a `CANCELLED` booking, and no incompatible allocation state/consumption combination. Future multi-resource allocation needs an approved replacement invariant before relaxing the one-primary-allocation rule.

## 5. Booking capacity and concurrency

### Initial N = 1 design

The capacity policy has one active `capacity_unit`; it is configuration, not a hard-coded business invariant. Every confirmed `SCHEDULED` and `IN_PROGRESS` booking owns one active allocation. The allocation range is generated from authoritative package duration and selected start, never client end time. The partial exclusion constraint is the final no-overlap backstop.

Confirmation uses a **serializable, bounded whole-transaction retry** policy:

1. Claim or resolve idempotency first (section 6). A committed same-key outcome is returned before any current-revision validation.
2. In a fresh transaction, lock deterministic authority rows: current package, calendar configuration/revision, then the eligible capacity unit(s), ordered by stable unit ordinal/ID. Re-read and validate their current values while locked.
3. Calculate `[start,end)`, validate operating-calendar eligibility, insert the capacity allocation, booking, immutable package snapshot, and idempotency outcome together.
4. Commit. Exclusion violation means a real current availability conflict, not a retry candidate. Serialization/deadlock failures retry the **entire** transaction with a bounded server policy; exhaustion returns a retryable transient failure without asserting availability.

Calendar/package administration obtains compatible revision-row locks before publishing a new revision. A confirmation either sees the old coherent authority state and commits before the edit, or sees/revalidates against the new one; it cannot validate a mix. Calendar conflict workflow still follows the approved guarded operation rather than silently modifying confirmed bookings.

### Allocation lifecycle

| Booking state/event | Allocation result |
|---|---|
| `SCHEDULED` | allocation exists and `consumes_capacity=true` |
| `IN_PROGRESS` | same allocation remains capacity-consuming and historical |
| authoritative `CANCELLED` commit | same allocation becomes non-consuming once, records release time/reason; row remains historical |
| requested/rejected/failed/ambiguous cancellation | no allocation release |
| `COMPLETED` | historical row remains and is not a cancellation release. If completion is recorded before `service_end`, its allocation remains consuming until the committed interval ends; it is never freed merely by status transition. Once elapsed, its historical range naturally cannot overlap a future interval. |

All status/state transition paths use the lifecycle command; direct allocation writes are not an alternate booking path.

### Future N > 1/resource invariant

Detailed implementation will introduce additional eligible units/resources without changing interval semantics. It must lock candidate units in deterministic order and allocate one that is compatible with the interval. It may use `FOR UPDATE SKIP LOCKED` to identify contention, but an all-locked candidate set is **retryable contention**, not unavailability. It reports unavailability only after a serializable/coherent scan proves no committed compatible unit. This prevents both over-capacity and false unavailability when another eligible unit exists. Resource combinations and eligibility policy need a future approved extension.

## 6. Confirmation idempotency protocol

**Scope:** `public.booking.confirm`. The public client creates one opaque high-entropy intent key per deliberate final confirmation, sends it outside URLs (header or body field selected during implementation), and preserves it for an ambiguous retry. Editing before submission does not require a new key. Materially editing after a submitted unresolved intent waits for outcome resolution; only then may a deliberate new intent be created.

**Canonical material:** selected package reference, selected start, service mode/pickup state, customer/vehicle values that will be stored, and intended payment method. The server canonicalizes it and stores a keyed fingerprint; it does not store the raw request merely for deduplication.

**Protocol:**

1. The unique intent row, full authoritative confirmation work, and final intent outcome are one serializable PostgreSQL transaction. There is no separately committed, non-final claim state. Concurrent same-key inserts wait for the winner to commit or roll back, then read its final row or retry the claim; they never execute a second confirmation or wait indefinitely on a stranded lease.
2. Existing fingerprint mismatch returns `IDEMPOTENCY_CONFLICT`; it never alters/replays the original booking as if it were the new request.
3. Existing final `COMMITTED` or final `REJECTED` outcome returns the stored canonical outcome before package/calendar/capacity revalidation. Thus a lost successful response remains recoverable after a later price/calendar change.
4. A newly claimed request performs the full transaction in section 5 and durably records a final outcome with the booking reference/projection (or sanitized final rejection). Transaction abort leaves no intent row/final outcome; a bounded transaction retry repeats the entire transaction with the same key/fingerprint.
5. Connection loss after commit is unknown to the browser but knowable from the record. A retry with the same key resolves it. There is no process-memory pending state.

Idempotency record retention must outlive the longest supported browser/server retry and recovery chain. A keyed fingerprint or outcome derived from customer/vehicle material is potentially linkable/pseudonymous operational data, even when it contains no raw request payload. Its lifecycle is bounded: the exact minimum useful duration remains a detailed security/production decision, but any fingerprint or outcome that contains or links to operational booking PII must be deleted or cryptographically irreversibly unlinked no later than the applicable 12-month terminal operational-PII lifecycle unless another documented valid purpose exists. Rejected or otherwise unconfirmed intents have no terminal booking timestamp, so they instead require a separately approved bounded expiry/deletion lifecycle before implementation; it must be retry-safe and cannot be indefinite. This lifecycle action never deletes the booking, is retry-safe, and records only minimized deletion context; canonical raw PII requests are never retained for idempotency.

## 7. Administrative authentication, sessions, and authorization

### OIDC integration and local sessions

Login uses provider-neutral OIDC Authorization Code flow with PKCE. A short-lived, single-use PostgreSQL login transaction binds the intended allowed callback target, state, nonce, and code verifier. Callback processing validates a preconfigured expected issuer and trusted discovery/JWKS origin (never an attacker-controlled discovery or JWKS location), signature/key material, audience for the configured client/application, expiry, nonce, state, PKCE exchange, redirect URI allowlist, and required identity claims. When an ID token has multiple audiences, validation enforces the OpenID Connect authorized-party (`azp`) semantics for the configured client. Failure is generic and consumes/invalidates the transaction where appropriate.

`issuer + subject` links a provider identity to one local admin account. The initial OWNER bootstrap is a controlled one-time operational procedure; it is not public registration, a reusable bootstrap secret, or an application default account. Exact procedure is a production gate.

After verified authentication and required MFA assurance, the application creates a random opaque local session identifier, stores only its verifier and state in PostgreSQL, and sets a host-scoped `Secure`, `HttpOnly`, path-limited cookie with a deliberate `SameSite=Lax` baseline. The OIDC token is not application authorization proof and is not sent to normal application routes. Each protected request resolves current server session, account state, assurance validity, authorization version, and permissions from PostgreSQL.

Sessions have finite idle and absolute expiry (durations unresolved), rotation on login, privilege/assurance elevation and other security boundary changes, and server-side revocation on logout, disablement, privilege reduction, recovery, suspected compromise, or MFA-factor/security event. Session identifiers, OIDC tokens, MFA factors, and callback values never enter durable browser storage, URLs, logs, audit, or telemetry.

### Authorization model

`OWNER` and `EMPLOYEE` are staff relationships; permissions are stable application identifiers, not provider roles. A request creates an internal authorization input:

```text
actor = local admin identity + active session + current assurance
action = stable permission-bearing operation
resource = concrete booking/package/calendar/account/audit target
field = omitted or an explicit sensitive field (CPF or pickup address)
```

The authorization service reads current grants and resource scope, default-denies missing/unknown/stale data, and returns a minimized decision/context version. Every repository command receives an already-authorized command context but repeats critical conditional checks at the database boundary. Client route visibility, role labels, internal IDs, and OIDC claims never authorize.

Every mutable input to an authorization decision participates in one coherent authorization version vector: account active/disabled state; session issue/revoke/logout state; MFA assurance/reset/expiry state; role assignment; role-to-permission mapping; direct/field permission policy; resource scope/ownership/reassignment; and applicable policy configuration. A reduction locks and increments the affected subject/session/resource/policy version(s), revokes affected sessions where required, and commits them together. The final read rule in section 9 locks and predicates on that complete vector from the primary database; cached decisions, replicas, stale OIDC claims, and ORM identity state are not authoritative. Last active recovery-capable OWNER removal/reduction is rejected in the same transaction unless an approved controlled transfer process applies.

### Cookie CSRF and rendering policy

- Admin and tracking session cookies are opaque, host-only where deployment allows, `Secure`, `HttpOnly`, with explicit path and expiration. They are not localStorage/sessionStorage/IndexedDB values.
- Cookie-authenticated unsafe requests use a server-stored, session-bound synchronizer CSRF token delivered only in same-origin rendered form/response state, plus Origin validation (and Referer fallback only where appropriate). `SameSite` is defense in depth, not the sole CSRF control. The token is rotated with the session and never appears in a URL.
- OIDC login/callback uses its own state/nonce/PKCE anti-forgery binding; callback destination is allowlisted. Tracking proof uses a neutral same-origin page and CSRF/origin protection so a third party cannot silently establish a tracking session in a victim browser.
- CORS is deny-by-default; no credentialed cross-origin API is required by MVP. User-controlled text is encoded; no untrusted HTML rendering is permitted.

## 8. Sensitive CPF and pickup-address disclosure

The disclosure flow is intentionally separate from normal detail projections and has eight ordered stages:

1. **AUTHENTICATE.** Authenticate using the current valid PostgreSQL-backed, server-controlled admin session. Do not rely on stale process-local state or stale OIDC claims.
2. **INITIAL AUTHORIZATION WITHOUT SENSITIVE FETCH.** Perform current server-side authorization for actor, action, booking/resource, and requested sensitive field. Do not fetch raw CPF or pickup address, hydrate a broader booking aggregate containing those fields, preload them, cache them, or log them.
3. **DURABLE AUDIT ACCEPTANCE.** Durably commit the minimized, idempotent `AUTHORIZED_FOR_DISCLOSURE` audit event, bound to actor, session/authentication instance, booking, field, authorization-policy/version, correlation ID, and request identity. It contains only approved minimized identifiers/context, never the raw sensitive value. If durable audit acceptance fails or its outcome is ambiguous, fail closed: do not fetch or disclose the field.
4. **FINAL STRONGLY CONSISTENT AUTHORIZATION BOUNDARY.** After audit commit, begin the final PostgreSQL consistency boundary for the actual sensitive read. It coordinates with the authoritative authorization/version state used by privilege-reduction and revocation paths; a stale cache, read replica, previously hydrated authorization result, stale provider claim, or process-local authorization state is not authoritative for this gate.
5. **CURRENT AUTHORIZATION RECHECK.** Immediately before the sensitive read, re-check current server-authoritative authorization: session validity; account active state; sufficient MFA/authentication assurance where required; current permissions and field permission; actor/action/resource/field authorization; and relevant authorization/version state. Any failure denies disclosure without fetching or returning raw sensitive PII.
6. **CONDITIONAL MINIMAL PROJECTION.** The dedicated sensitive-field persistence query is itself conditional on that successful final authorization predicate. It does not load the full booking or all customer PII, and never fetches the field first for application-side filtering. The query locks/reads the complete authorization version vector from the primary database—account, session revoke/logout, MFA/assurance/reset, grants, role-permission and field-policy mappings, resource scope, and applicable policy version—and returns no sensitive row when a predicate/version fails.
7. **FETCH ONLY THE REQUESTED FIELD.** Only after durable audit acceptance and final current authorization success may the persistence boundary fetch the specifically authorized CPF **or** pickup address. This final sensitive read is the authorization linearization point; it holds the shared authorization locks through read/commit so concurrent privilege, session, account, or assurance reductions either precede and deny the read or wait until it completes.
8. **RETURN WITH PRIVATE / NO-STORE BEHAVIOR.** Return only the authorized sensitive field using the approved private/no-store response behavior. The raw value must not enter logs, audit payloads, analytics, telemetry, APM, URLs, or intermediary/shared caches. A later revocation cannot retract bytes already released, which is why the linearization point is before delivery.

The runtime database role must not have a broad, casual raw-PII query path for normal routes. Column/table privileges and a narrowly guarded projection/function/view are defense in depth; implementation must prove that ORM hydration, broad joins, serializers, error paths, cache warming, and tracing cannot preload raw sensitive data. `AUTHORIZED_FOR_DISCLOSURE` means authorization for a potential disclosure was durably accepted. It does not assert that raw PII was fetched, the final current authorization gate succeeded, the HTTP response was delivered, the administrator received it, or the administrator read the field. If the final authorization check later fails, the earlier event remains truthful.

## 9. Audit architecture

`audit_events` is an append-only minimized envelope: UUID event ID; database-authoritative occurrence timestamp; event type/category; attempted/authorized/succeeded/denied/degraded outcome; schema version; opaque/minimized actor and target references; field reference when applicable; correlation/request reference; idempotency reference; and authorized-state version when relevant. It contains no raw PII, secret, request/response body, permission dump, cookie, token, or credential verifier.

The migration authority establishes audit schema/append-only rules. Runtime receives insert-only access through a narrow writer and cannot update/delete history. High-impact mutations write their event and domain state in the same PostgreSQL transaction; client success follows only a knowable durable outcome. Security-reducing tracking revocation may proceed with sanitized degraded signaling when audit persistence is unavailable, as the approved risk distinction requires. Normal public booking creation, normal non-sensitive reads, and initial automatic tracking issuance do not become a durable-audit availability dependency.

Audit retention is 24 months. A privileged lifecycle job removes/archives expired minimized records according to approved retention policy, with a retention execution record that contains only category/count/time/outcome. Audit-reader viewing/export remains separately permissioned and future scope as specified.

## 10. Public tracking

### Credential and proof-to-session design

The server generates a credential with at least 128 bits of cryptographic entropy, encoded base64url (opaque, URL-safe representation; it is still never placed in a URL). It stores only a keyed verifier/digest and verifier-key version, not the raw value. A key-management boundary retains active verifier keys by version for validation during rotation; destroying or retiring a key follows an approved credential invalidation/reverification process. Key material is outside source control and inaccessible to logging/analytics/APM.

There is one active credential per booking, enforced by the partial unique constraint and serializable issuance/replacement transaction. Credential issuance bookkeeping is **not** in the booking-confirmation transaction: a confirmed booking remains confirmed if no issuance record can yet be written. A controlled post-confirmation issuance controller first locks/probes for an existing credential or issuance record, proves the booking is confirmed, and creates/locks the unique issuance row. A crash before that marker exists is recoverable by the controller’s later probe: zero active credentials means it may create the one marker; an existing verifier means it must never reprovision.

The controller generates the raw value and commits exactly one verifier/version together with `ACTIVE_RAW_NONRECOVERABLE` issuance state. That state deliberately makes no claim that a browser received the response; it means only that the raw value was intentionally not persisted and can never be sent again. The initiating request may send its in-memory raw value only after that commit. A crash before commit leaves no verifier and permits a controlled retry; a crash after commit deterministically observes the nonrecoverable state and never retries raw delivery or creates a replacement. Browser refresh/ambiguous confirmation retry does not invoke provisioning. Confirmation remains successful, and only a future approved administrative replacement can recover a lost raw value. A provisioning failure never rolls back, deletes, duplicates, or silently alters the confirmed booking; a failed confirmation cannot reach the issuance controller or yield a valid credential.

The browser visits a neutral secret-free tracking URL. It sends the raw credential only in an HTTPS request body to a proof endpoint. That endpoint validates a bounded input, computes/verifies the keyed verifier in constant-time-capable library/database-safe logic, checks credential state/terminal expiry, applies abuse controls, then creates a short-lived opaque tracking-session cookie backed by a PostgreSQL verifier record. The status endpoint validates the tracking session **and** current credential version/state every time, then returns exactly `{ status }` from booking lifecycle.

Tracking cookie policy mirrors the secure opaque session design: `Secure`, `HttpOnly`, deliberate SameSite, finite short lifetime (exact value is an implementation/security decision), server-side revocation, no durable client storage, and CSRF/origin protection for cookie-authenticated mutation/proof operations. Credential revocation, replacement, expiry, or version invalidation makes all sessions for that credential version fail immediately through lifecycle check or revocation update.

### Lifecycle and failures

- `SCHEDULED`/`IN_PROGRESS`: active credential works unless revoked/replaced/invalidated.
- `COMPLETED`/`CANCELLED`: the authoritative booking status transaction writes `terminal_transition_at` once and, in the same transaction, sets every active credential’s `terminal_expires_at` to that instant plus seven days. Replays preserve that value. Tracking verification independently derives/compares the expiry from authoritative terminal state, so a missing/late lifecycle field fails closed rather than extending access. Expiry is separate from booking deletion and PII retention.
- Replacement creates an independent credential and atomically invalidates the old one; no two active credentials result from concurrent requests.
- Raw delivery is show-once. If a verifier was activated but response delivery was lost, the booking remains confirmed, the raw secret cannot be reconstructed, and refresh/ambiguous confirmation retry never creates another credential. Public PII/booking-ID recovery is forbidden. An authorized future administrative replacement workflow is the only possible recovery boundary and requires its separately approved assurance/audit policy.
- Invalid, malformed, nonexistent, expired, revoked, and replaced proofs receive the same generic public failure contract with minimized timing differences where reasonably achievable. They never disclose booking existence or lifecycle reason.

Rate limits combine source, subnet/device/request characteristics where privacy-appropriate, credential-proof attempt signals derived without retaining raw credentials, and global service protection. They are persistent/configurable defenses rather than authorization and do not rely only on IP. Only minimized abuse/security signals are retained; their retention duration remains unresolved.

## 11. Cache, browser, and rendering boundaries

Next.js defaults are performance-oriented, so route privacy is explicit rather than inferred. Sensitive routes include customer PII entry/review/confirmation, every admin route, CPF/address reveal, tracking proof, and tracking status.

- Sensitive segments explicitly use request-time dynamic rendering plus `fetchCache = 'force-no-store'`; Cache Components is not enabled for the MVP because its cache scopes would require a separately reviewed proof. They must not use `use cache`, static generation, server data cache, full-route cache, CDN shared cache, or prefetch mechanisms for sensitive payloads. The experimental `use cache: private` is not selected for production ([Next.js documentation](https://nextjs.org/docs/app/api-reference/directives/use-cache-private)).
- Every sensitive page and Route Handler sends `Cache-Control: no-store` (with the response marked private where appropriate) and is configured at the proxy/CDN not to cache it. This is a required safety property, not a future header choice. Sensitive links disable prefetch. Cookie-setting/deleting session actions are server-side actions/handlers that invalidate the authenticated client route state; logout, revocation, account switch, and tracking-session invalidation force a fresh navigation/refresh before protected content can render. Browser back-forward behavior and the Next Router Cache are tested with shared-device scenarios rather than assumed safe.
- Public catalogue/availability may be cached only when its minimal public projection contains no PII or secret and invalidation respects package/calendar revisions. Availability remains advisory and does not reserve capacity.
- Referrer policy prevents sensitive path/query propagation. PII and raw credential are prohibited from URLs; the raw tracking proof body is excluded from proxy/CDN/WAF/application/APM/error/analytics capture by route-specific body redaction/disablement.
- No third-party browser resource, analytics, support widget, advertising, replay, or telemetry script appears on sensitive screens without separately approved privacy minimum-data contract.

### Browser security-header baseline

Production HTTPS environments enforce HTTPS-only access/redirects at the edge or proxy for the complete first-party hostname and emit `Strict-Transport-Security`/HSTS on all of that hostname's HTTPS responses. Sensitive public flows, administrative flows, booking confirmation, CPF/address reveal, and public tracking additionally receive the provider-neutral browser-hardening baseline: a reviewed Content-Security-Policy, framing/clickjacking protection through CSP `frame-ancestors` and/or the applicable compatibility header, `X-Content-Type-Options: nosniff`, a restrictive `Referrer-Policy`, and an intentionally restricted `Permissions-Policy` where applicable. Final CSP source directives remain an implementation security review rather than an architectural default. Next.js supports path-specific response-header configuration; the application/proxy boundary must apply this policy consistently and browser/security integration tests must verify it.

### Abuse and resource-control baseline

Every route class has a bounded-work and abuse-control contract. Public availability accepts only a bounded date window, query/body size, and result count; it has a database query budget/timeout and differentiated abuse controls. Booking confirmation has a bounded body and transaction duration, bounded serializable/deadlock retries with backoff/jitter when retryable, idempotency-record growth controls, and a safe overload response; it never enters an unbounded retry loop. Public tracking retains generic failures, bounds credential input, and uses multiple privacy-appropriate signals with a shared, edge, provider-enforced, or equivalent multi-instance-effective control rather than IP alone.

OIDC initiation/callback flows bound request/state/nonce lifecycles and use account/source/provider-aware abuse signals where appropriate, not an IP-only security decision. Administrative list, calendar, and search-like reads bound page size, date range, and database work. The database/application operating envelope includes statement and transaction timeouts, bounded lock waits where appropriate, connection-pool exhaustion controls, and fail-safe overload behavior that does not amplify retry storms. Process-local limiting is defense in depth only; any protection required across application instances uses shared/edge/provider enforcement or an equivalent multi-instance design. No numeric threshold or Redis dependency is selected here.

## 12. Retention, deletion, and backups

Active `SCHEDULED`/`IN_PROGRESS` bookings retain operational PII required to deliver service. For `COMPLETED`/`CANCELLED`, a terminal timestamp starts a 12-month operational PII lifecycle. A retry-safe lifecycle worker selects eligible terminal PII records, conditionally transitions a lifecycle marker, deletes or irreversibly anonymizes only operational PII, and records a minimized execution outcome; it never records the removed value. Re-running is safe after interruption.

Fiscal records are a separate, minimized purpose/lifecycle. Applicable official fiscal requirements and exact fields/retention remain production gates and cannot justify keeping a complete operational booking PII record by default. Audit records are retained for 24 months. Tracking verifier post-expiry retention, tracking-session retention, the exact bounded confirmation-intent duration, minimized abuse/security-signal retention, and exact backup duration are unresolved and must be approved before their deletion jobs are enabled. The idempotency lifecycle is nevertheless capped by the rule in section 6 where it links to operational PII.

Backups necessarily may contain operational PII that existed at snapshot time. They are not observability stores: they require encryption, restricted backup/restore authority, access signaling/audit appropriate to operations, finite retention, and no casual browsing/export. Restore runbooks quarantine restored data, reconcile retention/anonymization executions, and reapply deletion/anonymization required after the backup’s snapshot before normal service resumes. Non-production uses synthetic data by default.

## 13. Error and response contracts

Server responses use a stable machine-readable error envelope with a correlation ID and a generic user-facing message; they never embed stack traces, SQL, permission internals, capacity internals, raw validation payloads, PII, or secrets.

| Category | Internal/API contract | Exposure rule |
|---|---|---|
| Invalid input | `VALIDATION_FAILED` | public field-safe details only; never echo sensitive values |
| Current-state conflict | `STALE_PACKAGE`, `STALE_CALENDAR`, `STALE_BOOKING`, `CAPACITY_UNAVAILABLE`, `IDEMPOTENCY_CONFLICT` | authenticated/public booking UI receives a safe reconcile prompt; no internal capacity reason |
| Retryable database race | `TRANSIENT_CONCURRENCY_FAILURE` | server may perform bounded whole-transaction retry; otherwise safe retry advice, no partial success claim |
| Admin access | `UNAUTHENTICATED`, `FORBIDDEN`, `SENSITIVE_FIELD_FORBIDDEN`, `AUDIT_UNAVAILABLE`, `INVALID_TRANSITION`, `CONFLICT_WITH_EXISTING_BOOKINGS` | hide inaccessible-resource existence where required; no unauthorized projection |
| Tracking | one outward generic tracking failure category | invalid/expired/revoked/replaced/nonexistent credentials are intentionally indistinguishable; exact HTTP/status wording deferred |

Successful public confirmation returns only the minimal interaction summary, never an internal booking ID as a credential or raw tracking secret after its show-once delivery boundary. Public tracking returns only current status.

## 14. Application interfaces

Transport remains same-origin App Router Route Handlers/server actions as appropriate; route shape is illustrative and not an external versioned API promise. Every input is runtime-validated; every result is an explicit projection.

| Surface | Command/query contract | Authority, idempotency, audit, privacy |
|---|---|---|
| Public catalogue | list active package references/minimal presentation | server filters ACTIVE/current revision; cacheable minimal public data |
| Package availability | selected `packageId` plus requested date/range | package reference is advisory; server computes duration/calendar/interval availability; rate-limited, minimal data, no reservation |
| Booking review | submitted draft selection and PII | server reconciles current package snapshot/BRL/duration/calendar/start/service mode/payment; masks CPF and minimizes contacts/address; no-store |
| Booking confirmation | canonical material + `Idempotency-Key` | lifecycle authoritative; client price/duration/end/capacity ignored; idempotency mandatory; no-store; final revalidation |
| Tracking proof/status | raw credential in proof body; status requires tracking session | proof rate-limited/no-store; status is `{status}` only and generic failure behavior |
| Admin session | login initiation/callback/logout/current session | OIDC validates authentication/MFA; local session and current local authz govern access; no provider role trust |
| Admin lists/detail | approved date/status/package/internal-reference filters; list/detail projections | current permission required; list/detail omit CPF/address; business timezone drives Today/Upcoming/History |
| Sensitive reveal | booking reference + exact field | explicit field permission, durable pre-authorization audit, final conditional authorization read, no-store |
| Status/cancellation | booking reference + current booking revision | lifecycle state machine authoritative; durable audit required; stale conflict safe |
| Package/calendar mutations | command + current package/calendar revision | catalogue/calendar authoritative; high-impact audit classification; guarded calendar conflict initially does not mutate |

The server treats all IDs and revision tokens from clients as references/detection hints. It resolves current state internally and never accepts client-computed price, duration, end time, currency, calendar decision, or capacity decision.

## 15. Observability and database privilege model

Observability is allowlist-based. Permitted fields include correlation/request ID, route class (not raw path/query), method, response category, duration, transaction retry count, package/calendar/booking opaque internal reference where authorized for operations, rate-limit bucket outcome, and sanitized exception classification. Metrics aggregate counts/latency and never label with PII or credentials.

Prohibited everywhere in observability: raw CPF, address, phone, email, licence plate, customer name when unnecessary, tracking credential/verifier, session value, OIDC token, authorization/cookie header, secret/key, and PII-bearing request/response body. Reverse proxies, CDN/WAF/load balancers, hosting access logs, APM, error reporting, analytics, and support tooling are configured with that exclusion. Request-body capture is disabled/redacted by route class, especially tracking proof and sensitive admin fields. Backups are governed separately by the encrypted/restricted lifecycle in section 12 and must never be confused with logging or telemetry.

| Database principal | Minimum responsibility | Explicit prohibition |
|---|---|---|
| Migration authority | extensions, schema, constraints, functions, grants | normal runtime use; embedded application credential |
| Application runtime | parameterized operations, narrow audited writers, guarded sensitive projections | DDL, role/grant change, audit update/delete, unguarded broad raw-PII reads |
| Backup/restore authority | controlled backup/restore only | normal application serving or mutation |
| Operational DB administration | emergency/maintenance under separate procedure | substitute for application authorization or casual PII browsing |

Database privileges are defense in depth, not a replacement for actor/action/resource/field authorization. Production secret and key access follows least privilege and is separately provider-reviewed.

### Secret inventory and lifecycle

The final deployment maintains a provider-neutral secret inventory covering: OIDC client secret or private-key material where applicable; PostgreSQL runtime, migration, and backup/restore credentials; admin-session and tracking-session verifier/key material where used; tracking credential verifier/HMAC/pepper keys if selected; login-state, nonce, and CSRF secret material where required; and any later signing/encryption keys. Runtime database credentials, migration credentials, and backup/restore credentials are separate categories and do not automatically share privileges.

For every category, production values are excluded from source control, client bundles, URLs, logs/APM/audit, and unauthorized environments; access is server-only, environment-separated, and least-privileged. The future provider-neutral operating design must define rotation, versioning where active records still need verification, revocation/containment, compromise response, and safe replacement without reconstructing raw historical credentials. Selecting a concrete secret manager remains a production provider decision.

## 16. Test architecture

| Layer | Purpose |
|---|---|
| Domain/unit | money, canonicalization, state transition eligibility, projections, validation adapters using synthetic data |
| PostgreSQL integration | constraints, revisions, enum/check rules, append-only permissions, guarded PII projection, migrations |
| Transaction/concurrency | real PostgreSQL concurrent confirmations, range exclusion, lifecycle guards, serializable retry, cancellation release-once, early-completion interval preservation, atomic final idempotency, calendar/package revision races, multi-unit future invariant |
| API/contract | DTO allowlists, error categories, stale reconciliation, no client authority, generic tracking failures |
| Auth/session/authorization | OIDC callback validation adapter, assurance/session rotation/revocation, default-deny, actor/action/resource/field, every version-vector reduction/reassignment race, CSRF |
| Tracking/audit/retention | verifier-only state, issuance crash/lost response, one active credential, terminal expiry transaction and fallback enforcement, revocation session invalidation, audit atomicity, sensitive pre-audit/final gate, lifecycle retries |
| Browser/end-to-end | Playwright verifies cookies/URLs/referrers, cache/no-store behavior, no durable storage, CSP/XSS/CSRF, public/admin projections, shared-device logout |

Range/exclusion behavior, transaction isolation/locking, cancellation capacity release, confirmation idempotency, audit-mutation atomicity, final sensitive authorization read, and tracking session invalidation **must** use real PostgreSQL integration/concurrency tests. Mocks cannot establish those guarantees.

## 17. Remaining production gates

| Gate | Classification |
|---|---|
| CPF concrete purpose, lawful basis, necessity/proportionality, transparency; applicable fiscal requirements/minimum fields | required before production CPF processing |
| OIDC/MFA provider, claims/assurance mapping, privacy/DPA/data-region/pricing review; MFA factor/recovery; OWNER bootstrap procedure | required before production; provider selection remains open |
| Exact session idle/absolute/recent-auth periods; tracking-session lifetime; tracking verifier/security-signal/idempotency retention | detailed security/production decisions before enabling relevant lifecycle |
| Backup duration and restore operational controls; hosting/PostgreSQL provider/region/DR/SLO | required before production |
| Administrative tracking replacement assurance | future extension approval before implementation |
| Calendar-conflict booking-resolution workflow; booking modification/rescheduling; customer notifications | future/out of MVP |

## 18. Focused adversarial review record

The design was challenged against concurrent confirmation, cancellation, revision edits, session/privilege reduction, MFA expiry, sensitive disclosure, tracking issuance/loss/revocation, audit, retention, cache, and logs. The following corrections are incorporated:

- capacity allocation state is transactionally and database-guardedly coupled to booking lifecycle; cancellation never deletes historical allocations and an early completion cannot free an unelapsed interval;
- committed idempotency outcome lookup precedes current-state revalidation; no non-final claim can strand because claim and outcome commit atomically; transaction races retry whole transactions, while true exclusion conflicts do not;
- final sensitive projection is conditional on a coherently locked current authorization version vector spanning session, assurance, grant, field-policy, and resource changes, and shares its linearization point with every reduction path;
- tracking issuance is a uniquely recorded post-confirmation effect with a known raw-delivery-loss state; terminal expiry is atomically set and independently enforced; credential lifecycle invalidates extant tracking sessions;
- sensitive Route Handler/page behavior explicitly uses dynamic/no-store, disables prefetch, and invalidates client route state on session changes; backups are separately encrypted/restricted rather than incorrectly treated as telemetry.

No remaining flaw changes an accepted ADR or specification. The unresolved items in section 17 require human/production decisions before deployment, not a change to the approved baseline.

## 19. Implementation readiness boundary

This document is sufficient to begin a later planning-and-task-breakdown phase after human approval. That planning must preserve module dependency directions and make unresolved retention/provider/security parameters explicit tasks or gates; it must not treat this document as authorization to implement before those planning decisions are approved.
