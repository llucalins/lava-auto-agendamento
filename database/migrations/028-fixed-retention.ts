import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    create table app.retention_executions (
      execution_id uuid primary key,
      job_class text not null check (job_class in ('TERMINAL_PII_12_MONTHS', 'AUDIT_24_MONTHS')),
      cutoff_at timestamptz not null,
      started_at timestamptz not null default current_timestamp,
      completed_at timestamptz not null,
      selected_count integer not null check (selected_count >= 0),
      affected_count integer not null check (affected_count >= 0),
      outcome text not null check (outcome = 'SUCCEEDED')
    );
    revoke all on app.retention_executions from public;
    revoke all on app.retention_executions from lava_test;

    create index bookings_terminal_retention_idx
      on app.bookings (terminal_transition_at, booking_id)
      where status in ('COMPLETED', 'CANCELLED');
    create index audit_events_retention_idx on app.audit_events (occurred_at, event_id);
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    drop index app.audit_events_retention_idx;
    drop index app.bookings_terminal_retention_idx;
    drop table app.retention_executions;
  `);
}
