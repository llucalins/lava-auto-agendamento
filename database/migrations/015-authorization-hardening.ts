import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql("alter table app.admin_identities alter column account_state set default 'ACTIVE'");
  pgm.addColumn({ schema: "app", name: "admin_sessions" }, { authorization_version: { type: "bigint" } });
  pgm.sql("grant update on app.admin_sessions to lava_test");
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropColumn({ schema: "app", name: "admin_sessions" }, "authorization_version");
  pgm.sql("alter table app.admin_identities alter column account_state set default '''ACTIVE'''");
}
