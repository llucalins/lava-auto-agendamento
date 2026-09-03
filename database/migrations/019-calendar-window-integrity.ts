import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    alter table app.calendar_recurring_windows
      add constraint calendar_recurring_windows_no_overlap
      exclude using gist (
        revision with =,
        weekday with =,
        int4range(
          (extract(epoch from starts_at) / 60)::integer,
          (extract(epoch from ends_at) / 60)::integer,
          '[)'
        ) with &&
      );

    alter table app.calendar_overrides
      add constraint calendar_override_kind_consistent
      exclude using gist (revision with =, calendar_date with =, is_closed with <>);

    alter table app.calendar_overrides
      add constraint calendar_open_windows_no_overlap
      exclude using gist (
        revision with =,
        calendar_date with =,
        int4range(
          (extract(epoch from starts_at) / 60)::integer,
          (extract(epoch from ends_at) / 60)::integer,
          '[)'
        ) with &&
      ) where (not is_closed);
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    alter table app.calendar_overrides drop constraint calendar_open_windows_no_overlap;
    alter table app.calendar_overrides drop constraint calendar_override_kind_consistent;
    alter table app.calendar_recurring_windows drop constraint calendar_recurring_windows_no_overlap;
  `);
}
