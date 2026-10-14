import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    alter table app.confirmation_intents
      drop constraint confirmation_intents_outcome_code;
    alter table app.confirmation_intents
      add constraint confirmation_intents_outcome_code check (
        outcome_code in ('BOOKING_CONFIRMED', 'CAPACITY_UNAVAILABLE', 'STALE_PACKAGE',
          'STALE_CALENDAR', 'STALE_PROMOTION', 'STALE_BOOKING', 'BOOKING_REQUEST_INVALID')
      );
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    alter table app.confirmation_intents
      drop constraint confirmation_intents_outcome_code;
    alter table app.confirmation_intents
      add constraint confirmation_intents_outcome_code check (
        outcome_code in ('BOOKING_CONFIRMED', 'CAPACITY_UNAVAILABLE', 'STALE_PACKAGE',
          'STALE_CALENDAR', 'STALE_BOOKING', 'BOOKING_REQUEST_INVALID')
      );
  `);
}
