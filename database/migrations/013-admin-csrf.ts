import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn({ schema: "app", name: "admin_sessions" }, { csrf_token_hash: { type: "char(64)" } });
  pgm.sql("grant update on app.admin_sessions to lava_test");
}

export function down(pgm: MigrationBuilder): void { pgm.dropColumn({ schema: "app", name: "admin_sessions" }, "csrf_token_hash"); }
