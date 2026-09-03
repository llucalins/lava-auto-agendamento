# Metadata retention gates

The fixed, approved privacy lifecycles are:

- terminal booking operational PII: **12 months** after the authoritative terminal transition;
- minimized audit records: **24 months**; and
- committed confirmation intents: removed or irreversibly unlinked no later than the associated booking's 12-month terminal operational-PII boundary.

Fiscal records are governed separately. No fiscal fields or fiscal retention duration are approved here, the 12-month operational-PII period is not a fiscal policy, and a fiscal purpose never authorizes retaining the complete operational booking record.

Rejected-confirmation-intent, tracking-session, tracking-verifier, and minimized abuse-signal cleanup have no approved production duration or default. A confirmation intent's persisted `expires_at` is a technical upper bound, not authorization to run its destructive cleanup job. Each job remains disabled unless an operator supplies both its positive duration (maximum 3,650 days) and the exact matching approval flag:

| Job | Duration | Approval |
| --- | --- | --- |
| Rejected confirmation intents | `REJECTED_INTENT_RETENTION_DAYS` | `REJECTED_INTENT_RETENTION_APPROVED=true` |
| Tracking sessions | `TRACKING_SESSION_RETENTION_DAYS` | `TRACKING_SESSION_RETENTION_APPROVED=true` |
| Tracking verifiers | `TRACKING_VERIFIER_RETENTION_DAYS` | `TRACKING_VERIFIER_RETENTION_APPROVED=true` |
| Abuse signals | `ABUSE_SIGNAL_RETENTION_DAYS` | `ABUSE_SIGNAL_RETENTION_APPROVED=true` |

Setting a duration without its approval flag is a configuration error. The cleanup cutoff must satisfy both the approved configured duration and any persisted technical expiry. Values used in tests are synthetic and do not constitute production approval. Before enabling a job, the designated privacy/security owner must record the approved purpose, duration, responsible authority, and activation approval/date in the deployment change record. Tracking's approved seven-day post-terminal credential usability does not approve any tracking metadata/database retention duration.

Backup retention remains a separate unresolved production gate. Automatic backup expiry/deletion stays disabled until the gate records a finite duration, provider-specific protected deletion behavior, accountable owner, purpose/legal basis, and approval date. Restored snapshots remain quarantined until the current lifecycle rules and post-snapshot erasure/anonymization records have been reapplied as defined in [backup-restore-runbook.md](backup-restore-runbook.md).

No unresolved destructive job can become active through a silent default, arbitrary constant, database `expires_at` alone, or duration environment variable without its matching approval gate. Missing or inconsistent configuration fails closed.

Jobs run with migration/retention credentials, process at most 500 candidates per transaction, use row locking with `SKIP LOCKED`, and persist only execution ID, class, cutoff, counts, timestamps, and outcome. Runtime credentials cannot read or mutate lifecycle execution records or abuse-signal storage.
