# Pilot deployment and rollback runbook

This is an operator checklist, not authorization to provision or deploy. Production remains blocked while any applicable human gate in [release-readiness.md](release-readiness.md) is open.

## Preconditions

- Approve the hosting/PostgreSQL provider, region, processor terms, domain, TLS, and service owner.
- Vercel Node.js functions scale across isolated instances. `runWithRouteConcurrency` is process-local and `createAbuseControl` has no configured shared provider; neither is global enforcement. Use only synthetic data in Preview and treat its URL as public unless protection available on the Hobby plan is verified. Do not expose public production traffic until the owner selects and approves a shared abuse/rate-limit control. Node 24.x and PostgreSQL remain the intended runtime/database.
- Create separate least-privilege runtime and migration credentials. Do not place `MIGRATION_DATABASE_URL` in the application runtime.
- Generate independent server-only secrets for confirmation fingerprints and tracking verification; use HTTPS `APP_ORIGIN` and approved OIDC/MFA settings. Never copy `.env.example` placeholders into production.
- Keep `PII_PROCESSING_APPROVED` unset or `false` until privacy/legal and operational owners approve actual fields, purpose, transparency, retention, incident contact, and operating procedures. The booking confirmation and readiness endpoints fail closed until explicitly enabled.
- Configure encrypted persistent backups only after finite retention, deletion, access, and restore procedures have been approved.

## Release procedure

1. Build from the reviewed commit with the pinned Node/npm versions and `npm ci --ignore-scripts`.
2. Run `npm test`, typecheck, lint, build, audits, fresh forward migrations, PostgreSQL integration/concurrency tests, and browser E2E against the release candidate.
3. Verify `GET /api/health` returns only a liveness result. Verify `GET /api/ready` returns readiness only when configuration, approved PII gate, and PostgreSQL are available; failures must not expose connection strings or internal errors.
4. Apply reviewed forward migrations using the privileged migration credential, then start the app with only the runtime credential.
5. Verify HTTPS, OIDC/MFA, OWNER bootstrap/recovery, authorization, CSRF, audit writes, and synthetic end-to-end booking before any real customer data is permitted.
6. Record release identifier, migration range, operator, checks, monitoring owner, and rollback decision. Enable real PII processing only after the human approval record exists.

## Backup, restore, and rollback

The detailed quarantine and retention reapplication contract is in [backup-restore-runbook.md](backup-restore-runbook.md). A provider-backed restore has not been executed by this repository workflow and must not be represented as tested. Before launch, restore a synthetic backup in an isolated quarantine environment and verify migrations, least-privilege grants, retention reapplication, revoked credentials, and release denial when a gate is missing.

Rollback means route traffic to the last known-good application artifact while retaining the forward-compatible database schema. Do not reverse migrations or restore an old snapshot as an application rollback. If schema/data integrity is uncertain, keep the service quarantined and follow the restore runbook with an authorized recovery owner.

## Current limitations

- Neon project/branch identity, Free PostgreSQL-only plan, role privileges, and schema were verified on 13/10/2026. The `production` branch belongs to `lava-auto` (`bitter-lake-69776129`), uses PostgreSQL 18 in `aws-sa-east-1`, and has migrations 001–029 applied. The final catalog validation and role separation are recorded in [release readiness](release-readiness.md). `.env.neon.local` is ignored and must remain outside Git.
- Initial migration gate is **complete**: `lava_migrator`, `lava_test`, and `lava_app` exist with separate credentials; `lava_app` has no schema-creation privileges; migrations 001–029 were applied only `up` in one transaction. Future migrations remain reviewed and forward-only. Never use the default owner URL as an application credential.
- Vercel project settings and secrets have not been configured. No deploy, provider backup/restore, deletion, rollback, load, or disaster-recovery exercise is evidenced.
- No real personal data is authorized while `PII_PROCESSING_APPROVED` is false/unset and legal, privacy, and operational gates remain open.

## Render Free demo preparation

`render.yaml` is a non-deploying Blueprint for a temporary, synthetic-data demonstration. It pins the web service to Render's `free` plan, disables automatic deploys, uses `/api/health`, and deliberately does not define a Render database: Neon remains the PostgreSQL authority. Render Free services sleep after inactivity, have an ephemeral filesystem, may be restarted, and Render explicitly says not to use Free instances for production. They may also be suspended for unusually high outbound traffic to an external database.

Before an operator creates the Render Blueprint, configure `DATABASE_URL` with the pooled URL for a dedicated least-privilege runtime role and the HTTPS `APP_ORIGIN`; configure the OIDC issuer/authorization/token/JWKS/client/redirect values for the selected provider (plus `OIDC_CLIENT_SECRET` only if that provider requires a confidential client). Keep `PII_PROCESSING_APPROVED=false` for the synthetic demonstration. Generate independent `CONFIRMATION_FINGERPRINT_KEY` and `TRACKING_VERIFIER_KEY` values and store them only in Render's secret environment settings. `MIGRATION_DATABASE_URL` is intentionally absent from the web service. Neon env pull exposes a direct/unpooled URL as `DATABASE_URL_UNPOOLED`, but the default pulled URL has not been proven to use a distinct migration role; do not simply alias it as a production migration credential. Obtain a dedicated migration-role URL and store it only in the operator's private migration environment, never Render's web service. Run reviewed migrations separately using that direct connection and the privileged migration credential, only after an authorized operator reviews the migration plan.

The Blueprint does not deploy the service by itself. Do not sync it or enable real PII without the outstanding hosting, OIDC/MFA, legal/privacy, retention, backup/restore, and owner approvals. Render Free is a demo target, not a production target.

## Vercel / Neon role configuration (verified 13/10/2026)

- Configure the Vercel runtime with only `DATABASE_URL`, using the pooled Neon connection for `lava_app` and database `neondb` on branch `production`. Select/derive the URL through the authenticated Neon Console/CLI; treat terminal output as a secret and paste it directly into Vercel's protected environment-variable UI or an approved secret manager.
- Keep `MIGRATION_DATABASE_URL` as the direct (unpooled) `lava_migrator` connection only in a separately protected, manually invoked migration environment. Do not add it to Vercel runtime or build variables; Vercel deployment does not run migrations.
- The pooled `lava_app` URL was generated and authenticated successfully. Effective checks confirmed it has no `CREATE` on the database or schemas, no `neon_superuser` membership, and inherits only the application grants from `lava_test`.
- No Vercel project was linked, so no Vercel settings were changed. Do not deploy or enable real PII until the human/legal/operations gates in `release-readiness.md` are approved. Migrations 001–029 are already applied to the verified empty production branch; future changes remain forward-only.

### Vercel environment-variable names

Production runtime requires `DATABASE_URL` (pooled `lava_app`), `APP_ORIGIN`, `CONFIRMATION_FINGERPRINT_KEY`, `TRACKING_VERIFIER_KEY_VERSION`, `TRACKING_VERIFIER_KEY`, `OIDC_ISSUER`, `OIDC_AUTHORIZATION_ENDPOINT`, `OIDC_TOKEN_ENDPOINT`, `OIDC_JWKS_URI`, `OIDC_CLIENT_ID`, and `OIDC_REDIRECT_URI`. Keep `PII_PROCESSING_APPROVED` explicitly `false` until the human gates are approved. `OIDC_CLIENT_SECRET` is conditional on the selected provider requiring a confidential client. Do not set `MIGRATION_DATABASE_URL`, `DATABASE_URL_UNPOOLED`, or any `NEXT_PUBLIC_*` database/auth secret in Vercel runtime.

Use a Pull Request to `main` for review and hosted CI, then use its Vercel Preview before merging. Keep Vercel's Production Branch set to `main`; pushing `fix/hosted-ci-portability` should create a Preview, not a production deployment. Preview secrets should use a separate isolated synthetic-data Neon branch, never the production branch. No GitHub push, PR, Vercel project linking, environment-variable configuration, or deployment was performed here.
