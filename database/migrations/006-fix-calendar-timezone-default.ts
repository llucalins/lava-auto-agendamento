import type { MigrationBuilder } from "node-pg-migrate";
export function up(pgm: MigrationBuilder): void { pgm.sql("alter table app.operating_calendar alter column timezone set default 'America/Fortaleza'"); }
export function down(pgm: MigrationBuilder): void { pgm.sql("alter table app.operating_calendar alter column timezone drop default"); }
