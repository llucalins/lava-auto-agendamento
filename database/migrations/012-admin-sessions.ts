import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable({ schema: "app", name: "admin_sessions" }, {
    session_verifier_hash: { type: "char(64)", primaryKey: true },
    issuer: { type: "text", notNull: true },
    subject: { type: "text", notNull: true },
    assurance: { type: "text", notNull: true, default: "'MFA'" },
    authenticated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    assurance_expires_at: { type: "timestamptz", notNull: true },
    idle_expires_at: { type: "timestamptz", notNull: true },
    absolute_expires_at: { type: "timestamptz", notNull: true },
    revoked_at: { type: "timestamptz" },
  });
  pgm.addConstraint({ schema: "app", name: "admin_sessions" }, "admin_session_bounds", { check: "length(session_verifier_hash) = 64 and assurance = 'MFA' and assurance_expires_at > authenticated_at and idle_expires_at > authenticated_at and absolute_expires_at > authenticated_at and assurance_expires_at <= authenticated_at + interval '8 hours' and idle_expires_at <= authenticated_at + interval '30 minutes' and absolute_expires_at <= authenticated_at + interval '8 hours'" });
  pgm.sql("grant insert, select, update on app.admin_sessions to lava_test");
}

export function down(pgm: MigrationBuilder): void { pgm.dropTable({ schema: "app", name: "admin_sessions" }); }
