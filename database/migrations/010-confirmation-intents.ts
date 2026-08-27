import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable({ schema: "app", name: "confirmation_intents" }, {
    intent_id: { type: "uuid", primaryKey: true },
    operation_scope: { type: "text", notNull: true },
    intent_key: { type: "text", notNull: true },
    request_fingerprint: { type: "text", notNull: true },
    state: { type: "text", notNull: true },
    booking_id: {
      type: "uuid",
      references: { schema: "app", name: "bookings" },
      onDelete: "RESTRICT",
    },
    outcome_code: { type: "text", notNull: true },
    outcome_projection: { type: "jsonb", notNull: true },
    lifecycle_class: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    completed_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    expires_at: { type: "timestamptz", notNull: true },
  });
  pgm.addConstraint({ schema: "app", name: "confirmation_intents" }, "confirmation_intents_scope_key", {
    unique: ["operation_scope", "intent_key"],
  });
  pgm.addConstraint({ schema: "app", name: "confirmation_intents" }, "confirmation_intents_scope", {
    check: "operation_scope = 'public.booking.confirm'",
  });
  pgm.addConstraint({ schema: "app", name: "confirmation_intents" }, "confirmation_intents_key", {
    check: "intent_key ~ '^[A-Za-z0-9_-]{32,128}$'",
  });
  pgm.addConstraint({ schema: "app", name: "confirmation_intents" }, "confirmation_intents_fingerprint", {
    check: "request_fingerprint ~ '^[a-f0-9]{64}$'",
  });
  pgm.addConstraint({ schema: "app", name: "confirmation_intents" }, "confirmation_intents_final_state", {
    check: "state in ('COMMITTED', 'REJECTED')",
  });
  pgm.addConstraint({ schema: "app", name: "confirmation_intents" }, "confirmation_intents_outcome_code", {
    check: "outcome_code in ('BOOKING_CONFIRMED', 'CAPACITY_UNAVAILABLE', 'STALE_PACKAGE', 'STALE_CALENDAR', 'STALE_BOOKING', 'BOOKING_REQUEST_INVALID')",
  });
  pgm.addConstraint({ schema: "app", name: "confirmation_intents" }, "confirmation_intents_outcome_projection", {
    check: "(state = 'COMMITTED' and outcome_code = 'BOOKING_CONFIRMED' and booking_id is not null and outcome_projection = jsonb_build_object('bookingId', booking_id::text, 'status', 'SCHEDULED')) or (state = 'REJECTED' and booking_id is null and outcome_code <> 'BOOKING_CONFIRMED' and outcome_projection = jsonb_build_object('code', outcome_code))",
  });
  pgm.addConstraint({ schema: "app", name: "confirmation_intents" }, "confirmation_intents_lifecycle", {
    check: "(state = 'COMMITTED' and lifecycle_class = 'BOOKING_TERMINAL_PII_BOUND') or (state = 'REJECTED' and lifecycle_class = 'REJECTED_BOUNDED')",
  });
  pgm.addConstraint({ schema: "app", name: "confirmation_intents" }, "confirmation_intents_bounded_retention", {
    check: "expires_at > completed_at and expires_at <= completed_at + interval '12 months'",
  });
  pgm.sql("GRANT INSERT, SELECT ON app.confirmation_intents TO lava_test");
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable({ schema: "app", name: "confirmation_intents" });
}
