# MVP security and privacy review

Review date: 2026-09-02. Scope: accumulated local Tasks 29–47 implementation and its dependencies. This record supports local review only; it is not production authorization and does not replace provider, legal/privacy, infrastructure, or merge approval.

## Review outcome

No unresolved local Critical or Required finding remains after focused correction of the active App Router authentication routes. OIDC login, callback, and logout are now exposed from the active root `app` tree and fail closed when provider configuration, callback material, session, Origin, or CSRF proof is absent. A browser regression test guards the route manifest and generic failures.

The reviewed boundaries are:

- PostgreSQL remains authoritative for booking capacity, idempotency, sessions, authorization versions, audit, sensitive disclosure, tracking lifecycle, and retention execution.
- OWNER/EMPLOYEE authorization is server-side and deny-by-default; tests cover IDOR, privilege reduction, self-escalation, last-owner protection, field permissions, and stale sessions.
- Unsafe cookie-authenticated operations require exact Origin and PostgreSQL-bound CSRF proof. OIDC uses server-persisted single-use state/nonce/PKCE, configured endpoints, signed claims, audience/`azp`, expiry, and MFA assurance before local session creation.
- Sensitive CPF/address disclosure preserves the eight-stage audit-first, current-state, race-safe PostgreSQL boundary. Raw values remain outside generic projections, URLs, storage, logs, and audit records.
- Tracking stores verifier-only credentials, delivers raw material once, binds short-lived server sessions to current credential version/state, returns status only, and invalidates on expiry/revocation/replacement.
- Booking confirmation, lifecycle, cancellation, capacity, package, and calendar mutations preserve parameterized SQL, bounded retries/work, transaction atomicity, revisions, and durable minimized audit.
- Fixed retention is limited to approved terminal operational PII at 12 months and minimized audit at 24 months. Rejected intents, tracking metadata, abuse signals, and backups remain fail-closed until their distinct production policies are approved.
- Browser policy provides CSP, HSTS, framing denial, nosniff, no-referrer, restricted permissions, and no-store behavior on sensitive surfaces. No production CORS allowlist is broadened.
- CI uses synthetic data, distinct PostgreSQL authorities, immutable Action commits, frozen dependencies, disabled install scripts, registry-signature checks, audits, and complete contract/integration/concurrency/browser gates.

## Review searches and regression evidence

Source and tests were checked for credential/PII logging, hardcoded production secrets, broad PII projections, unsafe SQL construction, client authorization, production mocks, blocking TODO/FIXME markers, duplicate active routes, and debug output. Synthetic test fixtures and documented placeholder configuration are not production secrets. `debug.log` is disposable local output and must remain absent from source control.

The final gate includes the complete Vitest suite, production build, lint, typecheck, migration chain, real PostgreSQL integration/concurrency tests, and Playwright flows. Canonical focused evidence includes `sensitive-race.test.ts`, tracking lifecycle/issuance/proof/status tests, authorization/session/CSRF tests, audit privilege tests, capacity/confirmation/cancellation tests, retention tests, and browser security/admin/public journeys.

## Production security gates

- Select and approve the OIDC/MFA provider, trusted endpoint/claim mapping, DPA/privacy/data-region/pricing posture, recovery factors, client credentials, and initial OWNER bootstrap ceremony.
- Approve CPF purpose, lawful basis, necessity/proportionality, transparency, and any applicable fiscal requirements before production CPF processing.
- Approve exact administrative session/recent-auth periods and unresolved rejected-intent, tracking-session, tracking-verifier, abuse-signal, and backup retention policies before enabling their gates.
- Select hosting/PostgreSQL region/provider, TLS/DNS, secret management, shared edge abuse controls, backups, restore exercise, DR/RTO/RPO/SLO, monitoring, alerting, and incident operations.
- Run hosted CI and require its three jobs through branch protection; complete independent human merge/security/privacy/operations approval.

These gates block production, not local synthetic-data evaluation. No deployment, production resource, provider connection, or production data operation was performed.
