import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    create table app.establishment_profile (
      establishment_id uuid primary key default '00000000-0000-4000-8000-000000000001'
        check (establishment_id = '00000000-0000-4000-8000-000000000001'),
      revision integer not null default 0 check (revision >= 0),
      trade_name text not null default '' check (length(trade_name) <= 100),
      whatsapp text not null default ''
        check (whatsapp = '' or whatsapp ~ '^\\+[1-9][0-9]{7,14}$'),
      address text not null default '' check (length(address) <= 500),
      updated_at timestamptz not null default current_timestamp
    );

    insert into app.establishment_profile default values;
    grant select, update on app.establishment_profile to lava_test;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    revoke select, update on app.establishment_profile from lava_test;
    drop table app.establishment_profile;
  `);
}
