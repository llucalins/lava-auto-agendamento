# Backup restore privacy runbook

## Preconditions and authority

A restore is an exceptional privileged operation. The incident/recovery owner records the backup identifier, snapshot timestamp, purpose, operators, approved target environment, and change/incident reference before access. Backup and restore credentials are separate from application runtime credentials. Backups and restore staging storage must be encrypted and access-restricted.

The exact backup-retention duration is deliberately unresolved. Automatic backup expiry/deletion must remain disabled until the privacy/security owner records a finite duration, legal/purpose basis, provider-specific deletion behavior, responsible authority, and approval date. Production backup readiness still requires this finite lifecycle. A fiscal purpose does not authorize retaining a full operational booking record.

## Quarantine contract

Restore into an isolated quarantine environment with application ingress, scheduled workers, outbound integrations, email/SMS, OIDC callbacks, and public/admin traffic disabled. Never restore production PII into a developer workstation or a general-purpose non-production environment. Use synthetic data for ordinary exercises.

Only the named restore operators and the privileged migration/retention role may connect. Runtime credentials must retain their restricted grants. Capture operational events and counts, never row values, request bodies, credentials, tracking secrets, or PII.

## Restore and reapplication

1. Verify the backup's provenance, integrity, encryption, snapshot timestamp, and approved target before restoring it into quarantine.
2. Apply every forward migration after the snapshot through the currently approved application schema. Never roll the production schema backward to fit a backup.
3. Rotate any application, session, OIDC, tracking-verifier, or database secret that could have been present or usable at the snapshot boundary before allowing service access.
4. Compare the restored migration ledger and lifecycle execution ledgers with the protected operational recovery record. Do not copy deleted row values back from another system.
5. Run fixed terminal-PII and audit retention against the current authoritative time, not the backup timestamp. Repeat batches until no eligible rows remain.
6. Run committed confirmation-intent cleanup against its fixed terminal-PII cap. Enable rejected-confirmation-intent, tracking-session, tracking-verifier, or abuse-signal cleanup only when the exact duration and matching approval gate described in [retention-gates.md](retention-gates.md) are present; a row expiry alone is insufficient.
7. Reapply any independently recorded anonymization, erasure, legal restriction, account disablement, credential revocation, and authorization-version invalidation that occurred after the snapshot. Use stable non-PII identifiers and approved operational records; never reconstruct deleted PII.
8. Revoke expired tracking sessions and verify every remaining public tracking credential against current booking state and credential version. A restored raw secret must never be emitted or reconstructed.
9. Validate database ownership and grants, append-only audit privileges, runtime/migration separation, row constraints, indexes, and migration checks before application processes receive credentials.
10. Record only the restore reference, snapshot time, migration range, lifecycle job execution IDs/counts, validation outcomes, operators, and release decision in the recovery record.

All lifecycle operations are retry-safe. An interrupted transaction must roll back its deletion and execution marker together; resume with the same execution ID when the prior transaction did not commit, or the next bounded batch with a new execution ID after a committed batch.

## Release checks

Normal service remains blocked until two authorized reviewers confirm:

- quarantine networking prevented application and integration traffic;
- the schema is current and runtime grants are least-privileged;
- expired PII, audits, idempotency records, sessions, verifiers, and approved abuse signals were removed through privileged jobs;
- post-snapshot erasure, anonymization, revocation, identity, and authorization changes were reapplied;
- no raw tracking credential, secret, or PII appears in lifecycle/recovery logs;
- focused PostgreSQL security, authorization, tracking, retention, migration-chain, and smoke tests pass;
- backup expiry is scheduled under the separately approved finite lifecycle; and
- the release decision, rollback path, and evidence locations are recorded.

If any check fails, keep the environment quarantined. Destroy a failed restore through the provider's approved recoverable/deletion workflow, preserve only minimized failure evidence, and begin a new isolated restore rather than exposing or repairing it in place.

## Recovery exercise design

Use a synthetic backup containing deliberately expired and non-expired fixtures, post-snapshot erasure/revocation records, and no production secrets. The exercise must prove isolation, forward migration, retention reapplication, retry after an injected interruption, privilege separation, security regression checks, and a denied release when one mandatory check is omitted. Record elapsed recovery and data-loss windows as measurements; do not claim an RTO/RPO that has not been approved and tested.

Before the first production exercise, the service owner must approve the exercise cadence, RTO/RPO targets, participants, evidence retention, backup duration, and provider-specific creation/deletion/restore procedures. A tabletop review alone does not prove provider restore or deletion behavior.
