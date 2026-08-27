import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable({ schema: "app", name: "admin_identities" }, { admin_id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") }, issuer: { type: "text", notNull: true }, subject: { type: "text", notNull: true }, role: { type: "text", notNull: true }, account_state: { type: "text", notNull: true, default: "'ACTIVE'" }, authorization_version: { type: "bigint", notNull: true, default: 1 } });
  pgm.addConstraint({ schema: "app", name: "admin_identities" }, "admin_identity_role_state", { check: "role in ('OWNER','EMPLOYEE') and account_state in ('ACTIVE','DISABLED') and authorization_version > 0" });
  pgm.addConstraint({ schema: "app", name: "admin_identities" }, "admin_identity_provider_subject", { unique: ["issuer", "subject"] });
  pgm.sql("grant select, insert, update on app.admin_identities to lava_test");
}

export function down(pgm: MigrationBuilder): void { pgm.dropTable({ schema: "app", name: "admin_identities" }); }
