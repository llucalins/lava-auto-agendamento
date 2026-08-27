import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql("REVOKE ALL ON app.audit_events FROM lava_test");
  pgm.sql("GRANT INSERT ON app.audit_events TO lava_test");
}

export function down(pgm: MigrationBuilder): void { pgm.sql("REVOKE ALL ON app.audit_events FROM lava_test"); }
