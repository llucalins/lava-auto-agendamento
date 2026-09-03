import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    alter table app.operating_calendar
      add column calendar_ref uuid not null default gen_random_uuid(),
      add constraint operating_calendar_ref_unique unique (calendar_ref);

    alter table app.calendar_recurring_windows
      drop constraint calendar_recurring_windows_pkey,
      add constraint calendar_recurring_windows_pkey
        primary key (revision, weekday, starts_at, ends_at);

    alter table app.calendar_overrides
      drop constraint calendar_overrides_pkey,
      drop constraint calendar_override_window,
      add column override_id uuid not null default gen_random_uuid(),
      add constraint calendar_overrides_pkey primary key (override_id),
      add constraint calendar_override_window check (
        (is_closed and starts_at is null and ends_at is null)
        or
        (not is_closed and starts_at is not null and ends_at is not null and starts_at < ends_at)
      );

    create unique index calendar_one_closed_override_per_revision_date
      on app.calendar_overrides (revision, calendar_date)
      where is_closed;
    create unique index calendar_unique_open_window_per_revision_date
      on app.calendar_overrides (revision, calendar_date, starts_at, ends_at)
      where not is_closed;

    grant update (revision) on app.operating_calendar to lava_test;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    revoke update (revision) on app.operating_calendar from lava_test;
    drop index app.calendar_unique_open_window_per_revision_date;
    drop index app.calendar_one_closed_override_per_revision_date;
    alter table app.calendar_overrides drop constraint calendar_overrides_pkey;
    alter table app.calendar_overrides drop constraint calendar_override_window;
    alter table app.calendar_overrides drop column override_id;
    alter table app.calendar_overrides add constraint calendar_overrides_pkey primary key (calendar_date);
    alter table app.calendar_overrides add constraint calendar_override_window check (is_closed or (starts_at is not null and ends_at is not null and starts_at < ends_at));
    alter table app.calendar_recurring_windows drop constraint calendar_recurring_windows_pkey;
    alter table app.calendar_recurring_windows add constraint calendar_recurring_windows_pkey primary key (weekday);
    alter table app.operating_calendar drop constraint operating_calendar_ref_unique;
    alter table app.operating_calendar drop column calendar_ref;
  `);
}
