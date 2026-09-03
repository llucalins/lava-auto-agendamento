import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql("grant update (current_revision) on app.service_packages to lava_test");
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql("revoke update (current_revision) on app.service_packages from lava_test");
}
