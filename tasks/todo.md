# Ordered MVP Implementation Tasks

> As 47 marcações abaixo são o registro histórico anterior à auditoria de 13/10/2026. Elas não constituem evidência atual de conclusão. O checklist corretivo da Sprint 01, ao final deste arquivo, é a fila operacional vigente.

Each task uses synthetic data and runs lint/typecheck/build when the toolchain exists.

# Phase 1: Dependency, toolchain, config, PostgreSQL, and audit foundations

## Task 1: Record dependency and install-policy evidence
**Description:** Verify Node LTS, manager, Next.js, pg, Zod, Vitest, Playwright, openid-client, and stable node-pg-migrate before install.
**Acceptance criteria:**
- [x] Official version/provenance evidence and one lockfile policy exist.
- [x] Install scripts are fail-closed pending review.
**Verification:**
- [x] Human reviews the evidence record.
**Dependencies:** None
**Files likely touched:**
- docs/dependency-review.md
- .npmrc
**Estimated scope:** S
**Skills for implementation:**
- source-driven-development
- security-and-hardening

## Task 2: Bootstrap project and test tooling
**Description:** Create pinned manager, Next.js TypeScript baseline, scripts, lockfile, gitignore, and empty Vitest/Playwright baseline.
**Acceptance criteria:**
- [x] Lint/typecheck/build/unit/browser commands work on verified Node LTS.
- [x] One reviewed lockfile and no generated/secret artifacts are tracked.
**Verification:**
- [x] Run baseline lint, typecheck, build, Vitest, and Playwright.
**Dependencies:** Task 1
**Files likely touched:**
- package.json
- package-lock.json
- tsconfig.json
- next.config.ts
- .gitignore
**Estimated scope:** M
**Skills for implementation:**
- incremental-implementation
- test-driven-development

## Task 3: Add typed server configuration boundary
**Description:** Add Zod environment schema, server/client separation, safe template, and secret/version exposure guard.
**Acceptance criteria:**
- [x] Missing/malformed configuration fails before serving requests.
- [x] Secrets/key versions cannot enter client bundles or diagnostics.
**Verification:**
- [x] Unit tests reject malformed configuration and inspect safe template.
**Dependencies:** Task 2
**Files likely touched:**
- src/server/shared/config.ts
- src/server/shared/config.test.ts
- .env.example
**Estimated scope:** S
**Skills for implementation:**
- security-and-hardening
- test-driven-development

## Checkpoint 1: Toolchain
- [x] Source review and baseline lint/typecheck/build/tests pass.

## Task 4: Establish pg transaction and integration-test harness
**Description:** Add pool, same-client transaction helper, local isolated PostgreSQL connection, and integration-test harness.
**Acceptance criteria:**
- [x] Every transaction uses one checked-out client and always releases it.
- [x] Tests use isolated PostgreSQL and synthetic data.
**Verification:**
- [x] Real PostgreSQL commit/rollback/same-client tests pass.
**Dependencies:** Task 3
**Files likely touched:**
- src/server/persistence/pool.ts
- src/server/persistence/transaction.ts
- tests/support/postgres.ts
**Estimated scope:** M
**Skills for implementation:**
- test-driven-development

## Task 5: Establish migration and database privilege boundary
**Description:** Integrate node-pg-migrate and document migration, runtime, backup/restore, and audit-history privilege separation.
**Acceptance criteria:**
- [x] Migration authority is separate from runtime; runtime cannot alter schema.
- [x] Privilege model reserves audit history and backup/restore paths.
**Verification:**
- [x] Apply clean test migrations and review role grants.
**Dependencies:** Task 4
**Files likely touched:**
- database/migrate.ts
- database/migrations/.gitkeep
- docs/database-roles.md
**Estimated scope:** S
**Skills for implementation:**
- security-and-hardening

## Task 6: Implement durable audit envelope
**Description:** Add versioned minimized append-only audit schema/writer with correlation and idempotency references.
**Acceptance criteria:**
- [x] Allowlisted envelope rejects raw PII, secrets, headers, and bodies.
- [x] Runtime is insert-only; events expose safe correlation metadata only.
**Verification:**
- [x] PostgreSQL privilege/schema and redaction tests pass.
**Dependencies:** Task 5
**Files likely touched:**
- database/migrations/*-audit-events.ts
- src/server/capabilities/audit-trail/writer.ts
- tests/integration/audit-trail.test.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening
- observability-and-instrumentation

## Checkpoint 2: Database and audit
- [x] PostgreSQL transaction/migration/audit tests pass.

# Phase 2: Catalogue, calendar, booking integrity, capacity, and idempotency

## Task 7: Persist service-package revisions
**Description:** Add package/revision/state persistence with BRL centavos and positive bounded duration.
**Acceptance criteria:**
- [x] `price_centavos >= 0`; zero/positive are valid and negatives fail.
- [x] Revision/state integrity preserves immutable historical references.
**Verification:**
- [x] PostgreSQL price/duration/revision tests pass.
**Dependencies:** Task 5
**Files likely touched:**
- database/migrations/*-service-packages.ts
- src/server/capabilities/service-catalog/repository.ts
- tests/integration/service-catalog.test.ts
**Estimated scope:** M
**Skills for implementation:**
- test-driven-development

## Task 8: Expose active public package projection
**Description:** Add active-only minimal package query and server-side catalogue validation.
**Acceptance criteria:**
- [x] Public projection excludes inactive/internal fields and PII.
- [x] Client price/duration/revision cannot become authoritative.
**Verification:**
- [x] Unit/API contract tests pass.
**Dependencies:** Task 7
**Files likely touched:**
- src/server/capabilities/service-catalog/public-query.ts
- src/app/api/public/packages/route.ts
- tests/contract/packages.test.ts
**Estimated scope:** S
**Skills for implementation:**
- api-and-interface-design

## Task 9: Persist operating-calendar rules
**Description:** Add recurring windows, overrides, temporary unavailability, revisions, and named business timezone validation.
**Acceptance criteria:**
- [x] America/Fortaleza is initial IANA authority; no-cross-midnight MVP rules hold.
- [x] Revisions and precedence protect calendar writes.
**Verification:**
- [x] PostgreSQL domain/constraint tests pass.
**Dependencies:** Task 5
**Files likely touched:**
- database/migrations/*-operating-calendar.ts
- src/server/capabilities/operating-calendar/repository.ts
- tests/integration/operating-calendar.test.ts
**Estimated scope:** M
**Skills for implementation:**
- test-driven-development

## Checkpoint 3: Public catalogue/calendar foundations
- [x] Package and calendar integration/contract tests pass.

## Task 10: Compute bounded package-duration availability
**Description:** Add advisory, bounded availability using calendar rules and authoritative instants without capacity reservation/fixed slots.
**Acceptance criteria:**
- [x] DST gaps/repeated times fail safely; client zones are not authority.
- [x] Package duration and calendar revision drive minimal selectable results.
**Verification:**
- [x] Unit DST/bounds tests and availability contract test pass.
**Dependencies:** Tasks 8, 9
**Files likely touched:**
- src/server/capabilities/operating-calendar/availability.ts
- src/app/api/public/availability/route.ts
- tests/contract/availability.test.ts
**Estimated scope:** M
**Skills for implementation:**
- test-driven-development

## Task 11: Persist booking aggregate and commercial snapshot
**Description:** Add booking identity/revision/status, service interval, package revision reference, immutable snapshot, service mode, and payment intent fields.
**Acceptance criteria:**
- [x] `[start,end)` and snapshot terms are server-authoritative.
- [x] Snapshot preserves BRL price/currency/duration across catalogue changes.
**Verification:**
- [x] PostgreSQL aggregate/snapshot tests pass.
**Dependencies:** Tasks 7, 10
**Files likely touched:**
- database/migrations/*-bookings.ts
- src/server/capabilities/booking-lifecycle/repository.ts
- tests/integration/booking-snapshot.test.ts
**Estimated scope:** M
**Skills for implementation:**
- test-driven-development

## Checkpoint 4: Booking aggregate
- [x] Aggregate/snapshot PostgreSQL tests pass.

## Task 12: Persist PII and enforce pickup invariant
**Description:** Add customer/vehicle PII boundary and guarded/deferred pickup-address invariant.
**Acceptance criteria:**
- [x] Pickup requires address; drop-off atomically retains none; email is optional.
- [x] Generic booking projections cannot preload sensitive PII.
**Verification:**
- [x] PostgreSQL invalid-final-state and projection tests pass.
**Dependencies:** Task 11
**Files likely touched:**
- database/migrations/*-booking-pii.ts
- src/server/capabilities/booking-lifecycle/pii-repository.ts
- tests/integration/pickup-invariant.test.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Task 13: Add capacity allocation integrity
**Description:** Add configurable N=1 units and guarded allocation rows with `[start,end)` exclusion protection, future N>1-compatible representation only.
**Acceptance criteria:**
- [x] Overlap fails, back-to-back succeeds, and SCHEDULED/IN_PROGRESS consume.
- [x] CANCELLED releases exactly once; COMPLETED retains history.
**Verification:**
- [x] Real PostgreSQL lifecycle/constraint tests pass.
**Dependencies:** Task 11
**Files likely touched:**
- database/migrations/*-capacity.ts
- src/server/capabilities/booking-lifecycle/allocations.ts
- tests/integration/capacity.test.ts
**Estimated scope:** M
**Skills for implementation:**
- test-driven-development

## Checkpoint 5: Booking model
- [x] Booking/PII/capacity PostgreSQL tests pass.

## Task 14: Prove capacity concurrency
**Description:** Prove concurrent allocation/confirmation contenders cannot exceed N=1.
**Acceptance criteria:**
- [x] Two overlapping concurrent transactions cannot both commit.
- [x] Cancellation/new-confirmation race preserves capacity semantics.
**Verification:**
- [x] Real PostgreSQL concurrency suite passes.
**Dependencies:** Task 13
**Files likely touched:**
- tests/integration/capacity-concurrency.test.ts
- tests/support/postgres.ts
**Estimated scope:** S
**Skills for implementation:**
- test-driven-development

## Task 15: Persist confirmation intent model
**Description:** Add intent key, canonical material request fingerprint, outcome projection, conflict/replay recognition, and bounded retention metadata without raw canonical PII.
**Acceptance criteria:**
- [x] Same key/material is recognizable and material mismatch conflicts.
- [x] Persisted metadata contains no raw customer request body and has lifecycle class.
**Verification:**
- [x] Unit/PostgreSQL fingerprint/uniqueness/redaction tests pass.
**Dependencies:** Task 12
**Files likely touched:**
- database/migrations/*-confirmation-intents.ts
- src/server/capabilities/booking-lifecycle/idempotency.ts
- tests/integration/idempotency-model.test.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Task 16: Integrate atomic confirmation recovery
**Description:** Use one PostgreSQL transaction to recover committed outcome before validation or revalidate, allocate, snapshot, create booking, and store outcome.
**Acceptance criteria:**
- [x] Lost HTTP response/retry creates no duplicate allocation or booking.
- [x] Safe transaction retry uses no process-memory correctness state or PII body logging.
**Verification:**
- [x] Real PostgreSQL recovery/concurrency tests pass.
**Dependencies:** Tasks 13, 15
**Files likely touched:**
- src/server/capabilities/booking-lifecycle/confirm.ts
- tests/integration/confirmation-recovery.test.ts
- tests/contract/confirmation.test.ts
**Estimated scope:** M
**Skills for implementation:**
- test-driven-development
- observability-and-instrumentation

## Checkpoint 6: Confirmation correctness
- [x] Capacity/idempotency/recovery PostgreSQL tests pass.

# Phase 3: Public booking vertical flow

## Task 17: Deliver package/day/start booking UI
**Description:** Deliver package-first package, day, and compatible-start selection with server revisions and stale invalidation.
**Acceptance criteria:**
- [x] No client commercial/capacity authority or PII URL/storage.
- [x] Selection is browser-verifiable and stale-safe.
**Verification:**
- [x] Playwright mobile selection test passes.
**Dependencies:** Task 16
**Files likely touched:**
- src/app/(public)/booking/page.tsx
- src/app/(public)/booking/SelectionSteps.tsx
- tests/e2e/booking-selection.spec.ts
**Estimated scope:** M
**Skills for implementation:**
- frontend-ui-engineering

## Task 18: Deliver personal-data step
**Description:** Add personal data entry after viable selection with safe boundary validation and ephemeral state.
**Acceptance criteria:**
- [x] Required/optional fields are clear and no raw PII reaches URL/durable storage.
- [x] Safe validation errors do not echo sensitive values.
**Verification:**
- [x] Browser and contract tests pass.
**Dependencies:** Task 17
**Files likely touched:**
- src/app/(public)/booking/PersonalStep.tsx
- tests/e2e/booking-personal.spec.ts
**Estimated scope:** S
**Skills for implementation:**
- frontend-ui-engineering
- security-and-hardening

## Task 19: Deliver vehicle-data step
**Description:** Add vehicle data entry and validation as a separate booking flow slice.
**Acceptance criteria:**
- [x] Vehicle input is bounded and not persisted in browser storage.
- [x] Server validation remains authoritative.
**Verification:**
- [x] Browser/contract tests pass.
**Dependencies:** Task 18
**Files likely touched:**
- src/app/(public)/booking/VehicleStep.tsx
- tests/e2e/booking-vehicle.spec.ts
**Estimated scope:** S
**Skills for implementation:**
- frontend-ui-engineering

## Checkpoint 7: Public PII entry
- [x] Browser storage/URL and validation checks pass.

## Task 20: Deliver service-mode and address step
**Description:** Add drop-off/pickup selection with conditional address and material state reset.
**Acceptance criteria:**
- [x] Address appears only for pickup and clears on drop-off.
- [x] Client cannot bypass server pickup invariant.
**Verification:**
- [x] Browser conditional-flow and contract tests pass.
**Dependencies:** Task 19
**Files likely touched:**
- src/app/(public)/booking/ServiceModeStep.tsx
- tests/e2e/booking-mode.spec.ts
**Estimated scope:** S
**Skills for implementation:**
- frontend-ui-engineering

## Task 21: Deliver payment-intent step
**Description:** Add intended payment allowlist selection with no payment processing or credential collection.
**Acceptance criteria:**
- [x] Only approved intent values are selectable/accepted.
- [x] No card/banking/PIX secret field exists.
**Verification:**
- [x] Contract and browser tests pass.
**Dependencies:** Task 20
**Files likely touched:**
- src/app/(public)/booking/PaymentStep.tsx
- tests/e2e/booking-payment.spec.ts
**Estimated scope:** S
**Skills for implementation:**
- frontend-ui-engineering

## Task 22: Deliver review and duplicate-safe confirmation UX
**Description:** Add masked CPF review, stale reconciliation, explicit confirmation, and intent-key duplicate-submit behavior.
**Acceptance criteria:**
- [x] CPF masks and material changes require renewed review.
- [x] Retry/double submit safely recovers prior outcome.
**Verification:**
- [x] Playwright stale/double-submit/lost-response test passes.
**Dependencies:** Tasks 16, 21
**Files likely touched:**
- src/app/(public)/booking/ReviewStep.tsx
- src/app/api/public/bookings/route.ts
- tests/e2e/booking-confirmation.spec.ts
**Estimated scope:** M
**Skills for implementation:**
- frontend-ui-engineering

## Checkpoint 8: Public booking
- [x] End-to-end booking and stale/retry/no-store checks pass.

# Phase 4: OIDC/session/authorization and protected operations

## Task 23: Implement OIDC login initiation
**Description:** Add provider-neutral authorization-code initiation with state, nonce, PKCE, allowlisted redirect, and server transient lifecycle.
**Acceptance criteria:**
- [x] State/nonce/PKCE are single-use, bounded, server-controlled.
- [x] Login initiation uses CSRF/origin protections and no tokens in logs/storage.
**Verification:**
- [x] Unit/contract initiation and replay tests pass.
**Dependencies:** Tasks 3, 6
**Files likely touched:**
- database/migrations/*-oidc-transactions.ts
- src/server/capabilities/admin-access/oidc-init.ts
- tests/contract/oidc-init.test.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Task 24: Validate OIDC callback and link identity
**Description:** Validate trusted issuer/discovery/JWKS signature, audience/azp, expiry, state/nonce, identity linkage, and mandatory MFA assurance.
**Acceptance criteria:**
- [x] Invalid callback/claims/assurance fail closed generically.
- [x] OIDC claims establish identity only, never application authorization.
**Verification:**
- [x] Mock-provider callback/claim tests pass.
**Dependencies:** Task 23
**Files likely touched:**
- src/server/capabilities/admin-access/oidc-callback.ts
- src/app/api/admin/auth/callback/route.ts
- tests/contract/oidc-callback.test.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Task 25: Create PostgreSQL local sessions
**Description:** Issue opaque Secure/HttpOnly local sessions from validated identity and record safe auth security classification.
**Acceptance criteria:**
- [x] Session is PostgreSQL-backed and no token/cookie/raw claim reaches telemetry.
- [x] Authentication remains distinct from authorization.
**Verification:**
- [x] Session creation/cookie tests pass.
**Dependencies:** Task 24
**Files likely touched:**
- database/migrations/*-admin-sessions.ts
- src/server/capabilities/admin-access/sessions.ts
- tests/integration/session-create.test.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening
- observability-and-instrumentation

## Checkpoint 9: OIDC/session creation
- [x] Initiation/callback/session tests and human provider-gate review pass.

## Task 26: Implement session revocation and CSRF
**Description:** Add rotation, idle/absolute expiry, logout/reduction revocation, CSRF synchronizer, and Origin/Referer handling.
**Acceptance criteria:**
- [x] Current server state revokes expired/reduced/disabled sessions.
- [x] Unsafe cookie requests require CSRF/origin validation.
**Verification:**
- [x] PostgreSQL lifecycle and browser CSRF/shared-device tests pass.
**Dependencies:** Task 25
**Files likely touched:**
- src/server/security/csrf.ts
- src/app/api/admin/auth/logout/route.ts
- tests/e2e/admin-csrf.spec.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Task 27: Implement application authorization and owner guard
**Description:** Add OWNER/EMPLOYEE relationship, default-deny permissions, actor/action/resource/field checks, versions, reduction invalidation, and last-owner guard.
**Acceptance criteria:**
- [x] CPF/address need explicit field permission; self-escalation/last-owner removal fail.
- [x] Privilege changes are current-state and durable-audit protected.
**Verification:**
- [x] PostgreSQL IDOR/reduction/owner tests pass.
**Dependencies:** Tasks 6, 26
**Files likely touched:**
- database/migrations/*-authorization.ts
- src/server/capabilities/admin-access/authorization.ts
- tests/integration/authorization.test.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Task 28: Deliver admin booking lists
**Description:** Add protected today/upcoming/history bounded projections.
**Acceptance criteria:**
- [x] Current authorization and page/date bounds apply.
- [x] Lists omit CPF/address and are private/no-store.
**Verification:**
- [x] Contract/browser authorization tests pass.
**Dependencies:** Task 27
**Files likely touched:**
- src/server/capabilities/admin-operations/booking-lists.ts
- src/app/(admin)/admin/bookings/page.tsx
- tests/e2e/admin-lists.spec.ts
**Estimated scope:** M
**Skills for implementation:**
- frontend-ui-engineering

## Task 29: Deliver admin booking detail
**Description:** Add protected approved ordinary detail projection.
**Acceptance criteria:**
- [x] Detail follows actor/resource policy and excludes sensitive fields by default.
- [x] Internal IDs do not authorize access.
**Verification:**
- [x] IDOR/projection browser and contract tests pass.
**Dependencies:** Task 28
**Files likely touched:**
- src/server/capabilities/admin-operations/booking-detail.ts
- src/app/(admin)/admin/bookings/[id]/page.tsx
- tests/e2e/admin-detail.spec.ts
**Estimated scope:** S
**Skills for implementation:**
- security-and-hardening

## Checkpoint 10: Admin read access
- [x] Session, authorization, list/detail tests pass.

## Task 30: Deliver audited status transition
**Description:** Add SCHEDULED→IN_PROGRESS and IN_PROGRESS→COMPLETED mutation with durable audit and allocation consistency.
**Acceptance criteria:**
- [x] Invalid/stale transitions make no effect.
- [x] Completed allocation history persists.
**Verification:**
- [x] PostgreSQL transition/audit tests pass.
**Dependencies:** Tasks 13, 27
**Files likely touched:**
- src/server/capabilities/admin-operations/status-transition.ts
- tests/integration/status-transition.test.ts
**Estimated scope:** S
**Skills for implementation:**
- security-and-hardening

## Task 31: Deliver audited cancellation
**Description:** Add SCHEDULED→CANCELLED mutation with exact-once committed capacity release.
**Acceptance criteria:**
- [x] Only SCHEDULED normally cancels; failed, rejected, or audit-ambiguous cancellation retains capacity.
- [x] Committed cancellation releases capacity exactly once; retries never duplicate mutation or release.
- [x] Cancellation audit and allocation change share one durable transaction outcome.
**Verification:**
- [x] PostgreSQL cancellation/race tests pass.
**Dependencies:** Tasks 6, 11, 13, 26, 27
**Files likely touched:**
- src/server/capabilities/admin-operations/cancel-booking.ts
- tests/integration/cancellation.test.ts
**Estimated scope:** S
**Skills for implementation:**
- security-and-hardening

## Task 32: Deliver package administration
**Description:** Add authorized package revisions/activate-deactivate with audit orchestration.
**Acceptance criteria:**
- [x] Stale writes fail and historical snapshots stay immutable.
- [x] High-impact term/state changes have durable minimized audit.
**Verification:**
- [x] PostgreSQL/contract/admin browser tests pass.
**Dependencies:** Tasks 7, 27
**Files likely touched:**
- src/server/capabilities/admin-operations/package-management.ts
- src/app/(admin)/admin/packages/page.tsx
- tests/integration/package-management.test.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Checkpoint 11: Admin mutations
- [x] Status/cancellation/package audit and concurrency tests pass.

# Phase 5: Sensitive disclosure and public tracking

## Task 33: Deliver calendar administration
**Description:** Add authorized recurring/override/unavailability calendar writes with revision and audit orchestration.
**Acceptance criteria:**
- [x] Writes are timezone-aware, stale-safe, and durably audited.
- [x] Public availability reconciles calendar revision.
**Verification:**
- [x] PostgreSQL/contract tests pass.
**Dependencies:** Tasks 9, 27
**Files likely touched:**
- src/server/capabilities/admin-operations/calendar-management.ts
- src/app/(admin)/admin/calendar/page.tsx
- tests/integration/calendar-management.test.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Task 34: Deliver guarded calendar conflict workflow
**Description:** Add conflict detection and explicit acknowledged application without silent move/cancel of existing bookings.
**Acceptance criteria:**
- [x] Affected-booking conflict is safe/bounded and leaves state unchanged until explicit approved action.
- [x] Revalidation prevents confirmation/calendar races.
**Verification:**
- [x] PostgreSQL race and browser workflow tests pass.
**Dependencies:** Tasks 16, 33
**Files likely touched:**
- src/server/capabilities/admin-operations/calendar-conflicts.ts
- tests/integration/calendar-conflicts.test.ts
- tests/e2e/calendar-conflicts.spec.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Task 35: Deliver sensitive disclosure boundary
**Description:** Implement the approved eight-stage CPF/address disclosure sequence with audit-first conditional minimal fetch.
**Acceptance criteria:**
- [x] 1. Authenticate using the current valid PostgreSQL-backed, server-controlled admin session.
- [x] 2. Perform initial actor/action/resource/field authorization without fetching or hydrating raw CPF/pickup address.
- [x] 3. Durably commit minimized `AUTHORIZED_FOR_DISCLOSURE` before raw sensitive-field access.
- [x] 4. Enter the final strongly consistent PostgreSQL authorization boundary for the actual read.
- [x] 5. Immediately recheck CURRENT session, account, MFA, permission, field/resource authorization, and authorization version/state.
- [x] 6. Execute a conditional minimal sensitive-field projection only when final authorization succeeds.
- [x] 7. Fetch only the requested CPF OR pickup address, never a broader PII projection.
- [x] 8. Return only that authorized field with private/no-store response behavior.
- [x] `AUTHORIZED_FOR_DISCLOSURE` never claims raw fetch, final authorization success, response delivery, or administrator receipt/read; raw values never enter logs/audit.
**Verification:**
- [x] Real PostgreSQL concurrency test reduces session/account/privilege/field authorization after initial success; stale authorization must not disclose PII.
- [x] PostgreSQL race proves final disclosure is deny-or-wait linearized, not mock-only.
**Dependencies:** Tasks 6, 26, 27, 29
**Files likely touched:**
- src/server/capabilities/admin-operations/sensitive-disclosure.ts
- src/app/api/admin/bookings/[id]/sensitive/[field]/route.ts
- tests/integration/sensitive-race.test.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening
- observability-and-instrumentation

## Checkpoint 12: Sensitive administration
- [x] Calendar/conflict/disclosure/race tests and human security review pass.

## Task 36: Persist tracking credential lifecycle
**Description:** Add high-entropy verifier-only credential persistence, version/state, one-active rule, revocation/replacement, and terminal expiry coupling.
**Acceptance criteria:**
- [x] Raw credential never persists and one active credential holds concurrently.
- [x] Terminal lifecycle sets seven-day expiry; version changes invalidate sessions.
**Verification:**
- [x] PostgreSQL lifecycle/race tests pass.
**Dependencies:** Tasks 11, 31
**Files likely touched:**
- database/migrations/*-tracking.ts
- src/server/capabilities/public-status-tracking/verifier.ts
- tests/integration/tracking-lifecycle.test.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Task 37: Deliver show-once tracking issuance
**Description:** Generate initial credential post-confirmation and return it once privately without coupling booking success to raw delivery.
**Acceptance criteria:**
- [x] Lost response cannot reconstruct/reissue; refresh never creates a second credential.
- [x] No public PII/booking-ID recovery exists; proof signals contain no raw credential.
**Verification:**
- [x] Issuance crash/retry and browser no-secret URL tests pass.
**Dependencies:** Tasks 22, 36
**Files likely touched:**
- src/server/capabilities/public-status-tracking/issuance.ts
- tests/integration/tracking-issuance.test.ts
- tests/e2e/tracking-show-once.spec.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Task 38: Deliver tracking proof-to-session
**Description:** Add neutral URL, HTTPS-body proof, generic failures, PostgreSQL tracking session, secure cookie, version binding, and safe abuse signals.
**Acceptance criteria:**
- [x] Credential stays out of URL/referrer/history/logs/storage and response is private/no-store.
- [x] Invalid/expired/revoked/replaced/nonexistent proofs are generic.
**Verification:**
- [x] PostgreSQL proof/session and browser leak tests pass.
**Dependencies:** Tasks 26, 36
**Files likely touched:**
- src/app/api/public/tracking/proof/route.ts
- src/server/capabilities/public-status-tracking/proof.ts
- tests/e2e/tracking-proof.spec.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Checkpoint 13: Tracking credential/proof
- [x] Tracking lifecycle/issuance/proof tests pass.

# Phase 6: Hardening, resource controls, observability, retention, and CI/review

## Task 39: Deliver tracking status-only projection
**Description:** Add current-session/current-credential status read returning exactly booking status.
**Acceptance criteria:**
- [x] Revocation/replacement/expiry invalidate reads immediately.
- [x] No booking ID, PII, package, capacity, or admin projection is returned.
**Verification:**
- [x] PostgreSQL lifecycle and browser cache/back tests pass.
**Dependencies:** Task 38
**Files likely touched:**
- src/app/api/public/tracking/status/route.ts
- src/app/(public)/tracking/status/page.tsx
- tests/e2e/tracking-status.spec.ts
**Estimated scope:** S
**Skills for implementation:**
- browser-testing-with-devtools

## Task 40: Apply browser security and cache hardening
**Description:** Apply HSTS, CSP boundary, framing, nosniff, Referrer/Permissions policies, CORS, no-store, and sensitive browser verification.
**Acceptance criteria:**
- [x] Sensitive routes disable unsafe caching/prefetch and browser storage.
- [x] Header policy is consistent across public/admin/tracking surfaces.
**Verification:**
- [x] Playwright/DevTools header/cache/frame/storage tests pass.
**Dependencies:** Tasks 22, 26, 39
**Files likely touched:**
- next.config.ts
- src/server/security/response-policy.ts
- tests/e2e/security-headers.spec.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Task 41: Add resource-control boundary
**Description:** Add body/page/date bounds, bounded retries, statement/transaction/lock limits, overload behavior, and shared/edge abuse-control adapter.
**Acceptance criteria:**
- [x] Work is bounded per route class and no Redis correctness dependency exists.
- [x] Multi-instance enforcement remains provider-gated; process-local controls are defense in depth.
**Verification:**
- [x] Limit/timeout/retry/overload tests pass.
**Dependencies:** Tasks 4, 16, 23, 38
**Files likely touched:**
- src/server/security/resource-controls.ts
- src/server/security/abuse-controls.ts
- tests/integration/resource-controls.test.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Task 42: Harden shared observability allowlist
**Description:** Add correlation IDs, safe error classes, structured allowlist, metrics, and cross-cutting prohibited-field enforcement.
**Acceptance criteria:**
- [x] No CPF/address/contact/plate/token/OIDC claim/header/body reaches logs/metrics/errors.
- [x] Existing audit, confirmation, auth, disclosure, and tracking classifications use one shared safe boundary.
**Verification:**
- [x] Serialized redaction and correlation/metric tests pass.
**Dependencies:** Tasks 6, 16, 25, 35, 38
**Files likely touched:**
- src/server/observability/logger.ts
- src/server/observability/metrics.ts
- tests/unit/observability.test.ts
**Estimated scope:** M
**Skills for implementation:**
- observability-and-instrumentation

## Checkpoint 14: Hardening/observability
- [x] Browser, resource-control, and observability tests pass.

## Task 43: Implement fixed retention jobs
**Description:** Add retry-safe terminal PII 12-month deletion/anonymization and minimized audit 24-month cleanup with non-PII execution records.
**Acceptance criteria:**
- [x] Active PII is retained; deleted values never enter cleanup audit metadata.
- [x] Jobs are interruption/retry safe.
**Verification:**
- [x] PostgreSQL lifecycle/retry tests pass.
**Dependencies:** Tasks 7, 12, 6
**Files likely touched:**
- src/server/capabilities/privacy/retention.ts
- tests/integration/retention.test.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Task 44: Implement bounded metadata cleanup framework
**Description:** Add lifecycle classes/jobs for idempotency outcomes/fingerprints, rejected intents, tracking verifiers/sessions, and abuse signals without inventing unresolved durations.
**Acceptance criteria:**
- [x] Idempotency data cannot outlive applicable PII absent another purpose; rejected intents are separately bounded.
- [x] Exact unresolved tracking/abuse durations are config gates, not assumed values.
**Verification:**
- [x] Lifecycle selection/retry tests pass; human approves enabled durations.
**Dependencies:** Tasks 15, 36, 38, 41
**Files likely touched:**
- src/server/capabilities/privacy/metadata-retention.ts
- tests/integration/metadata-retention.test.ts
- docs/retention-gates.md
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Task 45: Document backup restore reapplication
**Description:** Document/validate restore quarantine and reapplication of retention/anonymization before normal service.
**Acceptance criteria:**
- [x] Restore contract preserves privacy and finite-backup lifecycle.
- [x] Exact backup duration remains a production gate.
**Verification:**
- [x] Human reviews restore runbook and recovery exercise design.
**Dependencies:** Tasks 43, 44
**Files likely touched:**
- docs/backup-restore-runbook.md
- docs/retention-gates.md
**Estimated scope:** S
**Skills for implementation:**
- security-and-hardening

## Checkpoint 15: Retention
- [x] Retention/restore evidence and unresolved-duration review pass.

## Task 46: Configure CI quality gates
**Description:** Add frozen-install/provenance/security checks and staged lint/typecheck/build/unit/PostgreSQL/concurrency/contract/browser E2E gates.
**Acceptance criteria:**
- [x] CI is synthetic-data-only and enforces lockfile/script policy.
- [x] Available critical booking/auth/disclosure/tracking tests block regressions.
**Verification:**
- [x] Clean checkout CI run and intentional failing fixture pass.
**Dependencies:** Tasks 2, 16, 22, 35, 42, 45
**Files likely touched:**
- .github/workflows/ci.yml
- docs/ci-quality-gates.md
- tests/e2e/critical-flows.spec.ts
**Estimated scope:** M
**Skills for implementation:**
- ci-cd-and-automation

## Task 47: Conduct final MVP readiness review
**Description:** Assemble Definition-of-Done evidence and human security/privacy/operations review; do not claim production readiness while gates remain open.
**Acceptance criteria:**
- [x] Evidence identifies every unresolved provider/legal/retention/operating gate.
- [x] Out-of-MVP customer accounts/payments/notifications/recovery/rescheduling/N>1/provider infrastructure remain absent.
**Verification:**
- [x] Full CI and human review record pass.
**Dependencies:** Task 46
**Files likely touched:**
- docs/release-readiness.md
- docs/security-review.md
**Estimated scope:** S
**Skills for implementation:**
- code-review-and-quality

---

# Sprint 01 — backlog corretivo MVP Lean

## P0 — bloqueia homologação

- [ ] S01-01 Remediar dependências `high`/`critical` alcançáveis com versões mínimas revisadas. **Parcial:** runtime sem high/critical; auditoria completa ainda tem 5 high em tooling dev-only, sem waiver formal de proprietário.
  - Aceite: audits de produção e completo sem achado alto/crítico não mitigado; atualização extraordinária do Next em 14/10 reavaliada.
  - Verificar: audits, assinaturas, `npm test`, typecheck, lint e build.
  - Arquivos: `package.json`, `package-lock.json`, `docs/dependency-review.md`.
- [ ] S01-02 Corrigir encerramento do Playwright e regressão `/admin/calendar` do CI. **Parcial:** suíte local 29/29, encerrou com sucesso e `/admin/calendar` retornou 200; CI hospedado não foi executado.
  - Aceite: processo encerra 0 e teste pré-hidratação usa a página real sem 404; alteração preexistente é preservada.
  - Verificar: teste focado, suíte browser local e execução hospedada observada quando disponível.
  - Arquivos: `playwright.config.ts`, workflow/testes estritamente necessários.
- [x] S01-03 Implementar revisão pública autoritativa e confirmação vinculada ao snapshot revisado. **Concluída localmente:** E2E real navegador → API → PostgreSQL provou rejeição após mudança de preço/revisão do pacote e após bloqueio do calendário, sem booking/alocação e com intenção de rejeição registrada.
  - Aceite: pacote/preço/duração/disponibilidade obsoletos impedem confirmação sem escrita.
  - Verificar: `tests/e2e/public-booking-postgres.spec.ts` (2 reconciliações reais), integração e suíte Vitest: passou.
- [x] S01-04 Provar dupla submissão, concorrência e recuperação após resposta perdida. **Concluída localmente:** duas submissões simultâneas do mesmo payload e retry após resposta abortada depois do commit passaram; PostgreSQL confirmou exatamente 1 booking, 1 alocação e 1 intenção; retry retornou `replayed: true`.
  - Aceite: uma intenção gera uma reserva/alocação e replay devolve o resultado persistido.
  - Verificar: E2E Playwright sem mock de confirmação e integração PostgreSQL: passou.
- [ ] S01-05 Entregar login, lista, detalhe, mudança de status e cancelamento navegáveis. **Parcial:** lista/detalhe/status/cancelamento E2E com sessão sintética passou; autenticação OIDC real depende de configuração/provedor.
  - Aceite: fluxo autenticado completo com autorização, CSRF, revisão otimista e auditoria server-side.
  - Verificar: integração das rotas e Playwright autenticado.
- [ ] S01-06 Validar startup, health/readiness e gate fail-closed de PII real. **Parcial:** validação estrita no `instrumentation.register`, `/api/health`, `/api/ready` e gate antes de ler confirmação; falta smoke de processo com ambiente de produção sintético.
  - Aceite: produção rejeita configuração obrigatória ausente; readiness consulta PostgreSQL; resposta não revela detalhes.
  - Verificar: testes de configuração/rota e smoke de processo.
- [ ] S01-07 Preparar deploy, backup/restore/rollback e checklist de privacidade. **Parcial/bloqueada para schema:** runbook e Blueprint Render Free para demonstração sintética preparados; Neon autenticado/vinculado, projeto/branch confirmados, plano sem mudanças, plano gratuito confirmado, env pull isolado e conexão `pg` somente leitura validados. Em 13/10, catálogo confirmou zero tabelas/histórico, mas o Neon lista somente `neondb_owner`; `lava_migrator` e `lava_test` não existem. Não apliquei roles nem migrations para não usar o proprietário como substituto. Falta provisionar e comprovar credenciais/roles distintos e privilégio mínimo, revalidar extensão, executar migrations `up` revisadas, validar grants, rodar integração como runtime, restaurar backup sintético e receber decisões humanas de publicação.
  - Aceite: instruções reproduzíveis e restore com dados sintéticos; qualquer dependência humana permanece OPEN.
  - Verificar: exercício documentado e revisão contra a spec. Neon (13/10): `.neon` vinculado/ignorado; `neon config plan --branch production` = no changes, Postgres only; metadados `free_v3`; `.env.neon.local` com somente variáveis Postgres e ignorado; `pg` executou `SELECT 1` e contagem read-only do catálogo confirmou 0 tabelas no schema atual. Sem `neon deploy`, migration ou alteração de schema. Render: `render.yaml` validado localmente, sem sync/deploy e com PII desabilitada.
**Atualização 13/10:** o bloqueio de schema/roles descrito em S01-07 foi resolvido conforme as evidências Neon abaixo; permanecem abertas a publicação Vercel, backup/restore, CI hospedado e aprovações humanas.
- [ ] S01-08 Executar gates finais e revisão multidimensional.
  - Aceite: evidência real para testes, types, lint, build, PostgreSQL, browser e audits; estado Git e bloqueios separados.
  - Evidência local 13/10: `npm test` 39 arquivos/123 testes; `npm run test:browser -- --reporter=line --workers=1` 29/29, incluindo E2E PostgreSQL real; `npm run typecheck`, `npm run lint` e `npm run build` passaram. Playwright registrou aviso transitório `destination stream closed early` no cenário de pré-hidratação de calendário, mas cenário e suíte passaram. `node scripts/verify-ci-policy.mjs` foi executado em etapa anterior desta sprint; CI hospedado não executado.
  - Evidência supply-chain: audit de produção 0; audit completo 5 high dev-only (`braces`); `npm audit signatures` verificou assinaturas de 426 pacotes e 101 attestations. CI hospedado e restore de provedor não executados.
  - Verificação 13/10 após integração Neon: `npm test` 39 arquivos/123 testes; Playwright 29/29; typecheck, lint e build passaram; smoke PostgreSQL Neon `SELECT 1` passou. `npm audit --omit=dev`: zero vulnerabilidades. `npm audit`: 5 high apenas na cadeia dev `braces`/ESLint (sem `--force`). `render.yaml` segue com asserts locais previamente aprovados. Não executados: migration/alteração de schema, `neon deploy`, Render sync/deploy, CI hospedado, backup/restore.

## P1 — necessário para operação eficiente do piloto

- [x] S01-09 Disponibilizar edição essencial de pacotes/preços e calendário pelo navegador.
  - Aceite: OWNER realiza operações sem chamada manual de API e conflitos não perdem alterações.
- Evidência 13/10: `tests/e2e/admin-packages.spec.ts` e `tests/e2e/calendar-conflicts.spec.ts` passaram na suíte browser (25/25).
- [ ] S01-10 Integrar logs essenciais allowlisted e controle de abuso proporcional a uma instância.
  - Aceite: sem PII/segredo em logs e limitação local explicitamente incompatível com escala horizontal.
- [x] S01-11 Exibir aviso de privacidade e minimização no formulário público.
  - Aceite: finalidade operacional e gates pendentes claros; nenhum consentimento/base legal é inventado.
- Evidência 13/10: aviso no formulário orienta somente dados sintéticos até aprovação; gate de produção nega confirmação real por padrão.

## P2 — pós-MVP

- [ ] SaaS multi-tenant, assinatura e cobrança online.
- [ ] WhatsApp automático, relatórios/dashboards avançados e equipes sofisticadas.
- [ ] Rate limit distribuído, infraestrutura multi-instância e tracking público ampliado.

## Evidências — papéis Neon e schema inicial (13/10/2026)

- [x] Projeto/branch Neon, plano Free somente PostgreSQL e banco vazio reconfirmados imediatamente antes da escrita.
- [x] Criados `lava_migrator`, `lava_test` e `lava_app` sem associação administrativa Neon e sem `SUPERUSER`, `CREATEDB` ou `CREATEROLE`; runtime herda os grants de `lava_test` e não tem `CREATE` no banco ou schemas.
- [x] Aplicadas somente as migrations `up` 001–029, em transação única. Validados 22 tabelas `app`, 50 índices válidos, 242 constraints validadas, 29 registros de histórico, `btree_gist` 1.8 confiável e somente o seed sintético esperado de unidade de capacidade.
- [x] Autenticação direta do migrator/teste e autenticação pooled de `lava_app` verificadas; grants efetivos de tabela/schema incluem a restrição da tabela PII.
- [x] Verificação sintética isolada: `npm test` 39 arquivos/123 testes; E2E PostgreSQL real em navegador 4/4; Playwright completo 29/29. Alvo: banco local `lava_auto_agendamento_test`, não Neon production.
- [ ] Projeto/ambiente Vercel ainda não configurado porque nenhum projeto foi vinculado. Próximo passo: cadastrar somente `DATABASE_URL` pooled de `lava_app` nas variáveis runtime protegidas da Vercel; manter `MIGRATION_DATABASE_URL` direto de `lava_migrator` fora do ambiente da aplicação.
- [ ] Produção continua bloqueada até aprovar projeto/hosting e deploy Vercel, OIDC/MFA e bootstrap OWNER, privacidade/jurídico para PII, CI hospedado e exercício isolado de backup/restore. Não houve push, merge, deploy, PII real ou migration destrutiva.

## Preparação Vercel — revisão local (13/10/2026)

- [x] Branch e árvore revisadas; `.env.local`, `.env.neon.local` e `.neon` permanecem ignorados e fora do Git. Nenhum valor de credencial foi adicionado à árvore ou aos commits locais.
- [x] Compatibilidade inspecionada: `engines.node` é `24.x`; Vercel lista 24.x como runtime disponível; Next 16 usa runtime Node.js nas rotas; `pg.Pool` usa o URL pooled Neon e operações SQL encontradas usam transações/advisory locks transacionais, sem dependência de estado de sessão. Migration segue separada do runtime.
- [x] Reproduzida colisão entre fixtures E2E concorrentes e ausência de uma fixture administrativa na página limitada a 50 itens; Playwright foi serializado e o teste administrativo passou a usar horários livres de hoje.
- [x] Verificação local após esses ajustes: `npm test` 39 arquivos/123 testes; `npm run test:browser` 29/29 (1 worker); `npm run typecheck`, `npm run lint` e `npm run build` passaram.
- [ ] Publicar a branch para Vercel Preview somente após autorização do proprietário; hosted CI ainda não executado. Recomendação: PR para `main`, mantendo `main` como Production Branch da Vercel; não promover diretamente a branch `fix/hosted-ci-portability` a produção.
- [ ] Vercel ainda requer configuração protegida de runtime; usar URL pooled de `lava_app`, nunca o URL direto do migrator. Usar um branch Neon de Preview isolado; não conectar Preview ao banco production.
- [ ] Produção ainda depende de Vercel/OIDC/MFA/OWNER bootstrap, aprovação jurídica e operacional de privacidade/PII, CI hospedado e backup/restore exercitado. Manter `PII_PROCESSING_APPROVED=false`; nenhum deploy foi executado.
- [ ] Gate adicional de Vercel: a escala horizontal de Functions não compartilha o `runWithRouteConcurrency`; `createAbuseControl` não tem provider compartilhado configurado. Aprovar/configurar enforcement de abuso compartilhado antes de qualquer tráfego público. Preview privado/sintético apenas.
