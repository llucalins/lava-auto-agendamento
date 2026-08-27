import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable({ schema: "app", name: "audit_events" }, {
    event_id: { type: "uuid", primaryKey: true },
    occurred_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    category: { type: "text", notNull: true }, action: { type: "text", notNull: true }, outcome: { type: "text", notNull: true },
    schema_version: { type: "integer", notNull: true }, actor_ref: { type: "text", notNull: true }, target_ref: { type: "text", notNull: true },
    field_ref: { type: "text" }, correlation_id: { type: "uuid" }, idempotency_ref: { type: "text" }, authorization_context_ref: { type: "text" }, reason_code: { type: "text" }
  });
  pgm.sql("REVOKE ALL ON app.audit_events FROM PUBLIC");
  pgm.sql("GRANT INSERT ON app.audit_events TO lava_test");
}

export function down(pgm: MigrationBuilder): void { pgm.dropTable({ schema: "app", name: "audit_events" }); }
