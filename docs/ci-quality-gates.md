# CI quality gates

CI runs for every pull request and every push to `main`; it does not deploy. All credentials and records are synthetic and isolated to an ephemeral PostgreSQL service. Production secrets, backups, provider credentials, and PII are forbidden.

The pipeline pins Node 24 and npm 11.17.0, uses the authoritative `package-lock.json` through `npm ci --ignore-scripts`, preserves `ignore-scripts=true`, verifies registry signatures, and runs high-severity production/full dependency audits. GitHub Actions are pinned to immutable commits and checkout does not persist repository credentials.

Gates are staged as follows:

1. supply-chain policy, lint, typecheck, production build, and database-independent unit tests;
2. a fresh migration chain into PostgreSQL 17 followed by contract, integration, privilege, lifecycle, idempotency, and concurrency tests; and
3. a separately migrated PostgreSQL database plus the complete Playwright suite with one worker for deterministic browser security flows.

The PostgreSQL jobs create distinct non-superuser `lava_migrator` and `lava_test` roles. Only the bootstrap service account creates the database and roles; application tests use the restricted runtime URL, while privileged assertions and migrations use the migration URL. No production database URL is accepted or required.

`scripts/verify-ci-policy.mjs` rejects competing lockfiles, package-manager drift, install scripts, a non-frozen install, missing signature verification, mutable Action references, or missing runtime/migration role separation. Its unit test includes an intentionally failing policy fixture, proving violations are detected rather than silently accepted.

Repository branch protection must require all three jobs before merge. That hosted GitHub setting is an external project-administration step and is not configured by this workflow.
