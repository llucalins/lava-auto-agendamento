import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql("GRANT UPDATE ON app.bookings TO lava_test");
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql("REVOKE UPDATE ON app.bookings FROM lava_test");
}
