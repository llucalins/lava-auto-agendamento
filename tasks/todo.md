# Ordered MVP Implementation Tasks

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
- [ ] Every transaction uses one checked-out client and always releases it.
- [ ] Tests use isolated PostgreSQL and synthetic data.
**Verification:**
- [ ] Real PostgreSQL commit/rollback/same-client tests pass.
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
- [ ] Migration authority is separate from runtime; runtime cannot alter schema.
- [ ] Privilege model reserves audit history and backup/restore paths.
**Verification:**
- [ ] Apply clean test migrations and review role grants.
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
- [ ] Allowlisted envelope rejects raw PII, secrets, headers, and bodies.
- [ ] Runtime is insert-only; events expose safe correlation metadata only.
**Verification:**
- [ ] PostgreSQL privilege/schema and redaction tests pass.
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
- [ ] PostgreSQL transaction/migration/audit tests pass.

# Phase 2: Catalogue, calendar, booking integrity, capacity, and idempotency

## Task 7: Persist service-package revisions
**Description:** Add package/revision/state persistence with BRL centavos and positive bounded duration.
**Acceptance criteria:**
- [ ] `price_centavos >= 0`; zero/positive are valid and negatives fail.
- [ ] Revision/state integrity preserves immutable historical references.
**Verification:**
- [ ] PostgreSQL price/duration/revision tests pass.
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
- [ ] Public projection excludes inactive/internal fields and PII.
- [ ] Client price/duration/revision cannot become authoritative.
**Verification:**
- [ ] Unit/API contract tests pass.
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
- [ ] America/Fortaleza is initial IANA authority; no-cross-midnight MVP rules hold.
- [ ] Revisions and precedence protect calendar writes.
**Verification:**
- [ ] PostgreSQL domain/constraint tests pass.
**Dependencies:** Task 5
**Files likely touched:**
- database/migrations/*-operating-calendar.ts
- src/server/capabilities/operating-calendar/repository.ts
- tests/integration/operating-calendar.test.ts
**Estimated scope:** M
**Skills for implementation:**
- test-driven-development

## Checkpoint 3: Public catalogue/calendar foundations
- [ ] Package and calendar integration/contract tests pass.

## Task 10: Compute bounded package-duration availability
**Description:** Add advisory, bounded availability using calendar rules and authoritative instants without capacity reservation/fixed slots.
**Acceptance criteria:**
- [ ] DST gaps/repeated times fail safely; client zones are not authority.
- [ ] Package duration and calendar revision drive minimal selectable results.
**Verification:**
- [ ] Unit DST/bounds tests and availability contract test pass.
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
- [ ] `[start,end)` and snapshot terms are server-authoritative.
- [ ] Snapshot preserves BRL price/currency/duration across catalogue changes.
**Verification:**
- [ ] PostgreSQL aggregate/snapshot tests pass.
**Dependencies:** Tasks 7, 10
**Files likely touched:**
- database/migrations/*-bookings.ts
- src/server/capabilities/booking-lifecycle/repository.ts
- tests/integration/booking-snapshot.test.ts
**Estimated scope:** M
**Skills for implementation:**
- test-driven-development

## Checkpoint 4: Booking aggregate
- [ ] Aggregate/snapshot PostgreSQL tests pass.

## Task 12: Persist PII and enforce pickup invariant
**Description:** Add customer/vehicle PII boundary and guarded/deferred pickup-address invariant.
**Acceptance criteria:**
- [ ] Pickup requires address; drop-off atomically retains none; email is optional.
- [ ] Generic booking projections cannot preload sensitive PII.
**Verification:**
- [ ] PostgreSQL invalid-final-state and projection tests pass.
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
- [ ] Overlap fails, back-to-back succeeds, and SCHEDULED/IN_PROGRESS consume.
- [ ] CANCELLED releases exactly once; COMPLETED retains history.
**Verification:**
- [ ] Real PostgreSQL lifecycle/constraint tests pass.
**Dependencies:** Task 11
**Files likely touched:**
- database/migrations/*-capacity.ts
- src/server/capabilities/booking-lifecycle/allocations.ts
- tests/integration/capacity.test.ts
**Estimated scope:** M
**Skills for implementation:**
- test-driven-development

## Checkpoint 5: Booking model
- [ ] Booking/PII/capacity PostgreSQL tests pass.

## Task 14: Prove capacity concurrency
**Description:** Prove concurrent allocation/confirmation contenders cannot exceed N=1.
**Acceptance criteria:**
- [ ] Two overlapping concurrent transactions cannot both commit.
- [ ] Cancellation/new-confirmation race preserves capacity semantics.
**Verification:**
- [ ] Real PostgreSQL concurrency suite passes.
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
- [ ] Same key/material is recognizable and material mismatch conflicts.
- [ ] Persisted metadata contains no raw customer request body and has lifecycle class.
**Verification:**
- [ ] Unit/PostgreSQL fingerprint/uniqueness/redaction tests pass.
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
- [ ] Lost HTTP response/retry creates no duplicate allocation or booking.
- [ ] Safe transaction retry uses no process-memory correctness state or PII body logging.
**Verification:**
- [ ] Real PostgreSQL recovery/concurrency tests pass.
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
- [ ] Capacity/idempotency/recovery PostgreSQL tests pass.

# Phase 3: Public booking vertical flow

## Task 17: Deliver package/day/start booking UI
**Description:** Deliver package-first package, day, and compatible-start selection with server revisions and stale invalidation.
**Acceptance criteria:**
- [ ] No client commercial/capacity authority or PII URL/storage.
- [ ] Selection is browser-verifiable and stale-safe.
**Verification:**
- [ ] Playwright mobile selection test passes.
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
- [ ] Required/optional fields are clear and no raw PII reaches URL/durable storage.
- [ ] Safe validation errors do not echo sensitive values.
**Verification:**
- [ ] Browser and contract tests pass.
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
- [ ] Vehicle input is bounded and not persisted in browser storage.
- [ ] Server validation remains authoritative.
**Verification:**
- [ ] Browser/contract tests pass.
**Dependencies:** Task 18
**Files likely touched:**
- src/app/(public)/booking/VehicleStep.tsx
- tests/e2e/booking-vehicle.spec.ts
**Estimated scope:** S
**Skills for implementation:**
- frontend-ui-engineering

## Checkpoint 7: Public PII entry
- [ ] Browser storage/URL and validation checks pass.

## Task 20: Deliver service-mode and address step
**Description:** Add drop-off/pickup selection with conditional address and material state reset.
**Acceptance criteria:**
- [ ] Address appears only for pickup and clears on drop-off.
- [ ] Client cannot bypass server pickup invariant.
**Verification:**
- [ ] Browser conditional-flow and contract tests pass.
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
- [ ] Only approved intent values are selectable/accepted.
- [ ] No card/banking/PIX secret field exists.
**Verification:**
- [ ] Contract and browser tests pass.
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
- [ ] CPF masks and material changes require renewed review.
- [ ] Retry/double submit safely recovers prior outcome.
**Verification:**
- [ ] Playwright stale/double-submit/lost-response test passes.
**Dependencies:** Tasks 16, 21
**Files likely touched:**
- src/app/(public)/booking/ReviewStep.tsx
- src/app/api/public/bookings/route.ts
- tests/e2e/booking-confirmation.spec.ts
**Estimated scope:** M
**Skills for implementation:**
- frontend-ui-engineering

## Checkpoint 8: Public booking
- [ ] End-to-end booking and stale/retry/no-store checks pass.

# Phase 4: OIDC/session/authorization and protected operations

## Task 23: Implement OIDC login initiation
**Description:** Add provider-neutral authorization-code initiation with state, nonce, PKCE, allowlisted redirect, and server transient lifecycle.
**Acceptance criteria:**
- [ ] State/nonce/PKCE are single-use, bounded, server-controlled.
- [ ] Login initiation uses CSRF/origin protections and no tokens in logs/storage.
**Verification:**
- [ ] Unit/contract initiation and replay tests pass.
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
- [ ] Invalid callback/claims/assurance fail closed generically.
- [ ] OIDC claims establish identity only, never application authorization.
**Verification:**
- [ ] Mock-provider callback/claim tests pass.
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
- [ ] Session is PostgreSQL-backed and no token/cookie/raw claim reaches telemetry.
- [ ] Authentication remains distinct from authorization.
**Verification:**
- [ ] Session creation/cookie tests pass.
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
- [ ] Initiation/callback/session tests and human provider-gate review pass.

## Task 26: Implement session revocation and CSRF
**Description:** Add rotation, idle/absolute expiry, logout/reduction revocation, CSRF synchronizer, and Origin/Referer handling.
**Acceptance criteria:**
- [ ] Current server state revokes expired/reduced/disabled sessions.
- [ ] Unsafe cookie requests require CSRF/origin validation.
**Verification:**
- [ ] PostgreSQL lifecycle and browser CSRF/shared-device tests pass.
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
- [ ] CPF/address need explicit field permission; self-escalation/last-owner removal fail.
- [ ] Privilege changes are current-state and durable-audit protected.
**Verification:**
- [ ] PostgreSQL IDOR/reduction/owner tests pass.
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
- [ ] Current authorization and page/date bounds apply.
- [ ] Lists omit CPF/address and are private/no-store.
**Verification:**
- [ ] Contract/browser authorization tests pass.
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
- [ ] Detail follows actor/resource policy and excludes sensitive fields by default.
- [ ] Internal IDs do not authorize access.
**Verification:**
- [ ] IDOR/projection browser and contract tests pass.
**Dependencies:** Task 28
**Files likely touched:**
- src/server/capabilities/admin-operations/booking-detail.ts
- src/app/(admin)/admin/bookings/[id]/page.tsx
- tests/e2e/admin-detail.spec.ts
**Estimated scope:** S
**Skills for implementation:**
- security-and-hardening

## Checkpoint 10: Admin read access
- [ ] Session, authorization, list/detail tests pass.

## Task 30: Deliver audited status transition
**Description:** Add SCHEDULED→IN_PROGRESS and IN_PROGRESS→COMPLETED mutation with durable audit and allocation consistency.
**Acceptance criteria:**
- [ ] Invalid/stale transitions make no effect.
- [ ] Completed allocation history persists.
**Verification:**
- [ ] PostgreSQL transition/audit tests pass.
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
- [ ] Only SCHEDULED normally cancels; failed, rejected, or audit-ambiguous cancellation retains capacity.
- [ ] Committed cancellation releases capacity exactly once; retries never duplicate mutation or release.
- [ ] Cancellation audit and allocation change share one durable transaction outcome.
**Verification:**
- [ ] PostgreSQL cancellation/race tests pass.
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
- [ ] Stale writes fail and historical snapshots stay immutable.
- [ ] High-impact term/state changes have durable minimized audit.
**Verification:**
- [ ] PostgreSQL/contract/admin browser tests pass.
**Dependencies:** Tasks 7, 27
**Files likely touched:**
- src/server/capabilities/admin-operations/package-management.ts
- src/app/(admin)/admin/packages/page.tsx
- tests/integration/package-management.test.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Checkpoint 11: Admin mutations
- [ ] Status/cancellation/package audit and concurrency tests pass.

# Phase 5: Sensitive disclosure and public tracking

## Task 33: Deliver calendar administration
**Description:** Add authorized recurring/override/unavailability calendar writes with revision and audit orchestration.
**Acceptance criteria:**
- [ ] Writes are timezone-aware, stale-safe, and durably audited.
- [ ] Public availability reconciles calendar revision.
**Verification:**
- [ ] PostgreSQL/contract tests pass.
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
- [ ] Affected-booking conflict is safe/bounded and leaves state unchanged until explicit approved action.
- [ ] Revalidation prevents confirmation/calendar races.
**Verification:**
- [ ] PostgreSQL race and browser workflow tests pass.
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
- [ ] 1. Authenticate using the current valid PostgreSQL-backed, server-controlled admin session.
- [ ] 2. Perform initial actor/action/resource/field authorization without fetching or hydrating raw CPF/pickup address.
- [ ] 3. Durably commit minimized `AUTHORIZED_FOR_DISCLOSURE` before raw sensitive-field access.
- [ ] 4. Enter the final strongly consistent PostgreSQL authorization boundary for the actual read.
- [ ] 5. Immediately recheck CURRENT session, account, MFA, permission, field/resource authorization, and authorization version/state.
- [ ] 6. Execute a conditional minimal sensitive-field projection only when final authorization succeeds.
- [ ] 7. Fetch only the requested CPF OR pickup address, never a broader PII projection.
- [ ] 8. Return only that authorized field with private/no-store response behavior.
- [ ] `AUTHORIZED_FOR_DISCLOSURE` never claims raw fetch, final authorization success, response delivery, or administrator receipt/read; raw values never enter logs/audit.
**Verification:**
- [ ] Real PostgreSQL concurrency test reduces session/account/privilege/field authorization after initial success; stale authorization must not disclose PII.
- [ ] PostgreSQL race proves final disclosure is deny-or-wait linearized, not mock-only.
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
- [ ] Calendar/conflict/disclosure/race tests and human security review pass.

## Task 36: Persist tracking credential lifecycle
**Description:** Add high-entropy verifier-only credential persistence, version/state, one-active rule, revocation/replacement, and terminal expiry coupling.
**Acceptance criteria:**
- [ ] Raw credential never persists and one active credential holds concurrently.
- [ ] Terminal lifecycle sets seven-day expiry; version changes invalidate sessions.
**Verification:**
- [ ] PostgreSQL lifecycle/race tests pass.
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
- [ ] Lost response cannot reconstruct/reissue; refresh never creates a second credential.
- [ ] No public PII/booking-ID recovery exists; proof signals contain no raw credential.
**Verification:**
- [ ] Issuance crash/retry and browser no-secret URL tests pass.
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
- [ ] Credential stays out of URL/referrer/history/logs/storage and response is private/no-store.
- [ ] Invalid/expired/revoked/replaced/nonexistent proofs are generic.
**Verification:**
- [ ] PostgreSQL proof/session and browser leak tests pass.
**Dependencies:** Tasks 26, 36
**Files likely touched:**
- src/app/api/public/tracking/proof/route.ts
- src/server/capabilities/public-status-tracking/proof.ts
- tests/e2e/tracking-proof.spec.ts
**Estimated scope:** M
**Skills for implementation:**
- security-and-hardening

## Checkpoint 13: Tracking credential/proof
- [ ] Tracking lifecycle/issuance/proof tests pass.

# Phase 6: Hardening, resource controls, observability, retention, and CI/review

## Task 39: Deliver tracking status-only projection
**Description:** Add current-session/current-credential status read returning exactly booking status.
**Acceptance criteria:**
- [ ] Revocation/replacement/expiry invalidate reads immediately.
- [ ] No booking ID, PII, package, capacity, or admin projection is returned.
**Verification:**
- [ ] PostgreSQL lifecycle and browser cache/back tests pass.
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
- [ ] Sensitive routes disable unsafe caching/prefetch and browser storage.
- [ ] Header policy is consistent across public/admin/tracking surfaces.
**Verification:**
- [ ] Playwright/DevTools header/cache/frame/storage tests pass.
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
- [ ] Work is bounded per route class and no Redis correctness dependency exists.
- [ ] Multi-instance enforcement remains provider-gated; process-local controls are defense in depth.
**Verification:**
- [ ] Limit/timeout/retry/overload tests pass.
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
- [ ] No CPF/address/contact/plate/token/OIDC claim/header/body reaches logs/metrics/errors.
- [ ] Existing audit, confirmation, auth, disclosure, and tracking classifications use one shared safe boundary.
**Verification:**
- [ ] Serialized redaction and correlation/metric tests pass.
**Dependencies:** Tasks 6, 16, 25, 35, 38
**Files likely touched:**
- src/server/observability/logger.ts
- src/server/observability/metrics.ts
- tests/unit/observability.test.ts
**Estimated scope:** M
**Skills for implementation:**
- observability-and-instrumentation

## Checkpoint 14: Hardening/observability
- [ ] Browser, resource-control, and observability tests pass.

## Task 43: Implement fixed retention jobs
**Description:** Add retry-safe terminal PII 12-month deletion/anonymization and minimized audit 24-month cleanup with non-PII execution records.
**Acceptance criteria:**
- [ ] Active PII is retained; deleted values never enter cleanup audit metadata.
- [ ] Jobs are interruption/retry safe.
**Verification:**
- [ ] PostgreSQL lifecycle/retry tests pass.
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
- [ ] Idempotency data cannot outlive applicable PII absent another purpose; rejected intents are separately bounded.
- [ ] Exact unresolved tracking/abuse durations are config gates, not assumed values.
**Verification:**
- [ ] Lifecycle selection/retry tests pass; human approves enabled durations.
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
- [ ] Restore contract preserves privacy and finite-backup lifecycle.
- [ ] Exact backup duration remains a production gate.
**Verification:**
- [ ] Human reviews restore runbook and recovery exercise design.
**Dependencies:** Tasks 43, 44
**Files likely touched:**
- docs/backup-restore-runbook.md
- docs/retention-gates.md
**Estimated scope:** S
**Skills for implementation:**
- security-and-hardening

## Checkpoint 15: Retention
- [ ] Retention/restore evidence and unresolved-duration review pass.

## Task 46: Configure CI quality gates
**Description:** Add frozen-install/provenance/security checks and staged lint/typecheck/build/unit/PostgreSQL/concurrency/contract/browser E2E gates.
**Acceptance criteria:**
- [ ] CI is synthetic-data-only and enforces lockfile/script policy.
- [ ] Available critical booking/auth/disclosure/tracking tests block regressions.
**Verification:**
- [ ] Clean checkout CI run and intentional failing fixture pass.
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
- [ ] Evidence identifies every unresolved provider/legal/retention/operating gate.
- [ ] Out-of-MVP customer accounts/payments/notifications/recovery/rescheduling/N>1/provider infrastructure remain absent.
**Verification:**
- [ ] Full CI and human review record pass.
**Dependencies:** Task 46
**Files likely touched:**
- docs/release-readiness.md
- docs/security-review.md
**Estimated scope:** S
**Skills for implementation:**
- code-review-and-quality
