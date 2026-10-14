import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql("GRANT INSERT (capacity_unit_id, state, ordinal), UPDATE (state) ON app.capacity_units TO lava_test");
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql("REVOKE INSERT (capacity_unit_id, state, ordinal), UPDATE (state) ON app.capacity_units FROM lava_test");
}
