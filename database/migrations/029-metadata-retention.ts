import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    create table app.metadata_retention_executions (
      execution_id uuid primary key,
      job_class text not null check (job_class in (
        'IDEMPOTENCY_LINKED_PII_CAP',
        'REJECTED_CONFIRMATION_INTENTS',
        'TRACKING_SESSIONS',
        'TRACKING_VERIFIERS',
        'ABUSE_SIGNALS'
      )),
      cutoff_at timestamptz not null,
      started_at timestamptz not null default current_timestamp,
      completed_at timestamptz not null,
      selected_count integer not null check (selected_count >= 0),
      affected_count integer not null check (affected_count >= 0),
      outcome text not null check (outcome = 'SUCCEEDED')
    );
    revoke all on app.metadata_retention_executions from public;
    revoke all on app.metadata_retention_executions from lava_test;

    create table app.abuse_signals (
      signal_id uuid primary key,
      signal_class text not null check (signal_class in ('PUBLIC_AVAILABILITY', 'BOOKING_CONFIRMATION', 'TRACKING_PROOF', 'OIDC')),
      occurred_at timestamptz not null default current_timestamp
    );
    revoke all on app.abuse_signals from public;
    revoke all on app.abuse_signals from lava_test;

    create index confirmation_intents_expiry_idx
      on app.confirmation_intents (lifecycle_class, expires_at, intent_id);
    create index tracking_sessions_retention_idx
      on app.tracking_sessions (expires_at, session_verifier);
    create index tracking_credentials_booking_retention_idx
      on app.tracking_credentials (booking_id, credential_id);
    create index abuse_signals_retention_idx
      on app.abuse_signals (occurred_at, signal_id);
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    drop index app.abuse_signals_retention_idx;
    drop index app.tracking_credentials_booking_retention_idx;
    drop index app.tracking_sessions_retention_idx;
    drop index app.confirmation_intents_expiry_idx;
    drop table app.abuse_signals;
    drop table app.metadata_retention_executions;
  `);
}
