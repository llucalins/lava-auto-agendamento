import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    create table app.promotions (
      promotion_id uuid primary key default gen_random_uuid(),
      revision integer not null check (revision > 0),
      name text not null check (length(btrim(name)) between 1 and 100),
      discount_kind text not null check (discount_kind in ('PERCENTAGE', 'FIXED')),
      discount_value bigint not null check (discount_value > 0),
      state text not null check (state in ('ACTIVE', 'INACTIVE')),
      valid_from date not null,
      valid_through date not null,
      weekdays smallint[],
      starts_at time,
      ends_at time,
      check (valid_from <= valid_through),
      check (discount_kind <> 'PERCENTAGE' or discount_value <= 100),
      check (
        (weekdays is null and starts_at is null and ends_at is null)
        or
        (weekdays is not null and cardinality(weekdays) between 1 and 7
          and starts_at is not null and ends_at is not null and starts_at < ends_at
          and weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
      ),
      unique (promotion_id, revision)
    );
    create table app.promotion_services (
      promotion_id uuid not null references app.promotions(promotion_id) on delete restrict,
      package_id uuid not null references app.service_packages(package_id) on delete restrict,
      primary key (promotion_id, package_id)
    );
    create index promotions_active_dates on app.promotions (valid_from, valid_through)
      where state = 'ACTIVE';
    create index promotion_services_package on app.promotion_services(package_id, promotion_id);

    alter table app.booking_package_snapshots
      add column promotion_id uuid,
      add column promotion_revision integer,
      add column promotion_name text,
      add column discount_centavos bigint not null default 0,
      add column final_price_centavos bigint;
    update app.booking_package_snapshots set final_price_centavos = price_centavos;
    alter table app.booking_package_snapshots
      alter column final_price_centavos set not null,
      add constraint booking_snapshot_promotion_reference check (
        (promotion_id is null and promotion_revision is null and promotion_name is null and discount_centavos = 0)
        or
        (promotion_id is not null and promotion_revision > 0 and promotion_name is not null)
      ),
      add constraint booking_snapshot_discount_valid check (
        discount_centavos >= 0 and discount_centavos <= price_centavos
      ),
      add constraint booking_snapshot_final_price check (
        final_price_centavos = price_centavos - discount_centavos
      );

    grant select, insert, update on app.promotions to lava_test;
    grant select, insert, delete on app.promotion_services to lava_test;
    grant insert (promotion_id, promotion_revision, promotion_name, discount_centavos, final_price_centavos)
      on app.booking_package_snapshots to lava_test;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    revoke insert (promotion_id, promotion_revision, promotion_name, discount_centavos, final_price_centavos)
      on app.booking_package_snapshots from lava_test;
    revoke select, insert, delete on app.promotion_services from lava_test;
    revoke select, insert, update on app.promotions from lava_test;
    alter table app.booking_package_snapshots
      drop constraint booking_snapshot_final_price,
      drop constraint booking_snapshot_discount_valid,
      drop constraint booking_snapshot_promotion_reference,
      drop column final_price_centavos,
      drop column discount_centavos,
      drop column promotion_name,
      drop column promotion_revision,
      drop column promotion_id;
    drop table app.promotion_services;
    drop table app.promotions;
  `);
}
