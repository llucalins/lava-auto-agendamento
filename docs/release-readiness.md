# MVP release readiness

Review date: 2026-09-02. Classification: **LOCAL_BETA_READY**.

All 47 planned tasks have local implementation and verification evidence. The application is suitable for local beta evaluation with synthetic data and the isolated PostgreSQL roles described in `database-roles.md`. It is not production-ready and this record authorizes no deployment.

## Definition-of-Done evidence

- The authoritative lockfile, pinned Node/npm policy, disabled install scripts, lint, typecheck, production build, Vitest, fresh migrations, PostgreSQL integration/concurrency tests, and Playwright flows are represented as mandatory CI gates.
- Public booking covers package, date, compatible time, personal and vehicle data, service mode/address, payment intent, masked review, explicit idempotent confirmation, show-once tracking proof, and status-only tracking.
- Administration covers PostgreSQL-backed authentication/session boundaries, CSRF, authorization, bounded lists/detail, audited status/cancellation capabilities, package/calendar management, sensitive disclosure, and tracking lifecycle operations required by the plan.
- Security and privacy controls are recorded in `security-review.md`; retention and restore behavior is recorded in `retention-gates.md` and `backup-restore-runbook.md`.
- Forward migrations 001–029 constitute the local migration chain. Runtime and privileged migration/retention credentials remain separate.

## Open production gates

| Area | Required decision or external evidence |
| --- | --- |
| CPF/legal | Concrete purpose, lawful basis, necessity/proportionality, transparency, and applicable fiscal requirements/minimum fields. |
| Fiscal | Separate minimized schema/purpose/lifecycle; exact fields and duration remain undecided and never justify retaining complete operational PII. |
| OIDC/MFA | Provider, endpoints, client credentials, claims/assurance mapping, DPA/privacy/data region/pricing, MFA recovery, and initial OWNER bootstrap. |
| Session/security periods | Exact production idle, absolute, recent-auth, and tracking-session periods where canonical approval is still required. |
| Retention | Rejected-intent, tracking-session, tracking-verifier, and abuse-signal purposes/durations/owners/approval dates. These jobs remain disabled. |
| Backups/restore | Finite duration, provider deletion procedure, encryption/access controls, restore authority, exercise cadence, DR/RTO/RPO, and proof that retention is reapplied after restore. Automatic expiry/deletion remains disabled. |
| Infrastructure | Hosting and PostgreSQL provider/region, DNS/TLS, secrets, migrations, health checks, capacity/SLO, DR, and production operating ownership. |
| Abuse/observability | Multi-instance edge/shared enforcement, monitoring provider, privacy-safe logs/metrics, alert thresholds, dashboards, and incident response. |
| CI/governance | First hosted clean run, required branch-protection checks, independent human approval, release/rollback ownership, and environment protection. |

No unresolved duration has a destructive default-on path. Terminal booking operational PII remains fixed at 12 months and minimized audit at 24 months; fiscal records remain separately governed.

## Explicitly absent from the MVP

Customer accounts/login, loyalty, online payment processing or payment credentials, payment gateways, outbound customer notifications, customer recovery, booking modification/rescheduling, native mobile applications, N>1 capacity behavior, administrative tracking-credential replacement workflow, and provider-specific production infrastructure are not implemented. The payment step records only an intended allowlisted method.

## Launch boundary

Local beta may proceed only with synthetic data and local secrets. Production remains blocked until every applicable gate above is approved and exercised. The future launch must use forward-only migrations, a staged release, monitoring and rollback evidence, and the backup restore quarantine process. No current document should be read as permission to push, deploy, provision, or process production PII.
