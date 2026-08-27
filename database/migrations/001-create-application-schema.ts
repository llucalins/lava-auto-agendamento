import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createSchema("app");
  pgm.sql("GRANT USAGE ON SCHEMA app TO lava_test");
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropSchema("app", { cascade: true });
}
