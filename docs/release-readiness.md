# MVP release readiness

## Sprint 01 reassessment — 13/10/2026

The older review below records the 02/09/2026 local-beta checkpoint and is not current release authorization. Current local evidence: `npm test` passed 123 tests in 39 files; Playwright passed 29/29 with one worker; `npm run typecheck`, `npm run lint`, and `npm run build` passed. The new `tests/e2e/public-booking-postgres.spec.ts` drives the real browser UI through review and confirmation APIs into PostgreSQL (no API mocks): concurrent same-intent submits yielded exactly one booking/allocation/intent; retry after commit with a deliberately lost response returned the persisted replay; package price/revision and calendar changes after review were rejected without booking/allocation writes. All fixtures use synthetic data. A transient `destination stream closed early` server diagnostic appeared during the pre-hydration calendar scenario, which passed along with the full suite. `/api/health`, `/api/ready`, and the production PII fail-closed gate are implemented. Production dependency audit reports zero findings, but the full audit still reports five high findings in the development-only ESLint dependency graph. Hosted CI has not been rerun. OIDC provider configuration/login, provider backup/restore, and legal/privacy/production-owner approvals remain open. Production is not ready.

Initial Neon/Render setup on 13/10/2026 (before owner authentication): `npx neon@latest` resolved CLI 8.4.3; `neon init` created a PostgreSQL-only `neon.ts` with `auth: false` and no Data API, Functions, buckets, or AI Gateway. The OAuth flow initially stopped before linking. See the verified follow-up below for the current state.

Neon/Render verification on 13/10/2026: the authenticated CLI linked `.neon` to project `bitter-lake-69776129`, organization `org-dry-field-29759607`, branch `production`; `.neon` is ignored by Git. `neon config plan --branch production` reported **No changes** and only Postgres as a utilized service. Read-only project metadata reported subscription type `free_v3`. `neon env pull --branch production --file .env.neon.local --service postgres` wrote only `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `NEON_BRANCH` to the ignored local file; the existing `.env.local` hash remained unchanged. A `pg` connection through `DATABASE_URL` executed `SELECT 1` successfully, and a catalog-only count found zero tables in the current schema. No schema migration, `neon deploy`, Render sync, or application deploy was performed. Runtime and migration roles have not been separated/provisioned on Neon; do not use the default pulled URLs for real customer data. `@neon/config` is a devDependency; the unused `@neon/env` package was removed. Production audit: zero vulnerabilities; complete audit: five high findings in the dev-only `braces` → `micromatch` → `fast-glob` → `eslint-config-next` chain, with npm's suggested force fix being a breaking downgrade and therefore not applied. `render.yaml` remains a synthetic-data-only Free demo Blueprint; Render was not synced or deployed.

Neon schema initialization review on 13/10/2026: read-only Neon CLI metadata reconfirmed project `bitter-lake-69776129` (`lava-auto`), organization `org-dry-field-29759607`, PostgreSQL 18, `free_v3`, region `aws-sa-east-1`, and the sole branch `production` (`br-round-brook-b67i9h53`, primary/default, ready). Catalog review through the linked database found `current_database=neondb`, `current_schema=public`, zero user tables across non-system schemas, and no `public.lava_migrations` history table. Neon role listing contains only the default `neondb_owner`; no `lava_migrator` or `lava_test` exists. The owner login has `CREATEDB`/`CREATEROLE` but is not a superuser; this is not an acceptable runtime or migration credential.

The forward chain is `database/migrations/001`–`029`, invoked by `npm run migrate` as `lava_migrator` with `MIGRATION_DATABASE_URL` and `--single-transaction`; runtime grants target `lava_test`. Migration 009 requests `btree_gist`, which is available on the Neon PostgreSQL 18 target (catalog availability was verified previously; extension installation under a least-privilege migrator has not been proven). Migrations contain no customer data seed; 009 adds only a fixed synthetic capacity unit. However, 018 replaces primary/check constraints with `DROP CONSTRAINT`/`ADD CONSTRAINT`, and 021 includes a data backfill `UPDATE` (zero rows on this empty target). Down migrations include table/schema drops and must never be invoked for initial setup. Forward migration plan, once roles are independently provisioned and reviewed: (1) recheck project/branch and empty-schema preconditions read-only; (2) use a dedicated migration URL outside Render runtime to apply only `up` migrations 001–029 in the existing single transaction; (3) validate `app` tables, indexes, constraints, `lava_migrations` history and effective grants; (4) run synthetic PostgreSQL integration tests through `lava_test`; (5) keep the default owner URL out of app configuration. No role DDL or schema writes were made in this review because the required least-privilege roles/credentials are absent. No migration was run, and schema/index/constraint/history/grant post-migration checks and Neon-backed integration tests remain **blocked**, not passed. Production remains not ready.

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

## Neon provisioning follow-up — 13/10/2026

This follow-up supersedes the earlier open migration-gate statements above. Immediately before database writes, the authenticated CLI reconfirmed project `lava-auto` (`bitter-lake-69776129`), organization `org-dry-field-29759607`, and the sole ready primary/default branch `production` (`br-round-brook-b67i9h53`). The Neon plan was a no-op with PostgreSQL only; the project reports Free. Read-only SQL reconfirmed database `neondb`, zero user relations, no `public.lava_migrations`, and trusted `btree_gist` 1.8.

Provisioned `lava_migrator`, `lava_test`, and `lava_app` as SQL roles with no Neon administrative membership. Each has LOGIN after its password was generated/reset through the authenticated Neon control plane; all have `NOSUPERUSER NOCREATEDB NOCREATEROLE`. `lava_app` inherits `lava_test` grants with no role-switch privilege. Effective checks confirmed `lava_app` has no database, `app`, or `public` CREATE privilege, no table ownership, no table-wide read of the PII table, and only the runtime grants inherited from `lava_test`. `lava_migrator` alone has database and `public` schema CREATE for migrations and the trusted extension.

Applied only `up` migrations 001–029 using the existing single-transaction `npm run migrate` path and the direct `lava_migrator` URL. No `down` or data deletion ran. Post-migration catalog checks found 22 `app` tables, 50 valid/live indexes, 242 validated constraints, zero invalid indexes/constraints, all 29 migration-history rows, `btree_gist` 1.8, and exactly one row in `capacity_units` (the migration's fixed synthetic capacity unit). `lava_app` authenticated over the Neon pooler; `lava_test` and `lava_migrator` authenticated directly. No real bookings or personal data were inserted into Neon.

Credential handling: Neon-generated passwords/connection strings were held only in process memory for verification and were not printed or written to Git or `.env.local`. `.env.neon.local` remains ignored; its Windows ACL was restricted to the current session, file owner, SYSTEM, and Administrators. The authenticated CLI can generate the role URLs on demand. No Vercel project is linked/configured, so no Vercel environment secret was set. Set only the pooled `lava_app` URL as runtime `DATABASE_URL`; keep direct `lava_migrator` `MIGRATION_DATABASE_URL` in a separate protected migration job/secret store and out of Vercel runtime/build variables.

Isolated local PostgreSQL verification: `.env.local` points to `localhost/lava_auto_agendamento_test` with distinct `lava_test` and `lava_migrator` roles. The real-browser PostgreSQL booking E2E passed 4/4; full Vitest passed 123/123 in 39 files; full Playwright passed 29/29. These tests used only synthetic fixtures and did not write to Neon production.

This is schema/credential preparation, not production approval. Vercel deployment, authenticated OIDC/MFA and OWNER bootstrap, legal/privacy and real-PII authorization, hosted CI, provider backup/restore exercise, operational ownership, and release/rollback approval remain open. No push, merge, or deployment occurred.

## Vercel runtime compatibility review — 13/10/2026

The code targets Node.js 24.x, supported by Vercel, and Next.js App Router handlers use the Node.js runtime. The application `pg.Pool` is configured for a Neon pooled `DATABASE_URL`; the inspected SQL uses explicit schema-qualified relations and transaction-scoped locks/settings, not session-level advisory locks or persistent session state. Neon documents transaction-mode pooling and its session-state limitations. This is a compatibility review plus local build/E2E evidence, not a hosted deployment test.

Security gate: Vercel Functions scale across isolated instances. The current `runWithRouteConcurrency` counters are process-local, and `createAbuseControl` has no configured shared provider. These controls cannot enforce a global request/abuse limit on Vercel. Keep any Preview private and synthetic; do not expose public production traffic until the owner approves and configures shared enforcement. Other open gates remain OIDC/MFA and OWNER bootstrap, legal/privacy authorization, hosted CI, backup/restore, and operating ownership. Production is not ready.
