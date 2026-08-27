import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql("create extension if not exists btree_gist");
  pgm.createTable({ schema: "app", name: "capacity_units" }, {
    capacity_unit_id: { type: "uuid", primaryKey: true },
    state: { type: "text", notNull: true },
    ordinal: { type: "integer", notNull: true, unique: true },
  });
  pgm.addConstraint({ schema: "app", name: "capacity_units" }, "capacity_units_state", {
    check: "state in ('ACTIVE', 'INACTIVE')",
  });
  pgm.addConstraint({ schema: "app", name: "capacity_units" }, "capacity_units_ordinal_positive", {
    check: "ordinal > 0",
  });
  pgm.sql(
    "insert into app.capacity_units (capacity_unit_id, state, ordinal) values ('00000000-0000-0000-0000-000000000001', 'ACTIVE', 1)",
  );
  pgm.addConstraint({ schema: "app", name: "bookings" }, "bookings_service_interval_reference_unique", {
    unique: ["booking_id", "service_start", "service_end"],
  });
  pgm.sql(`create table app.capacity_allocations (
    allocation_id uuid primary key,
    booking_id uuid not null,
    capacity_unit_id uuid not null references app.capacity_units (capacity_unit_id) on delete restrict,
    service_start timestamptz not null,
    service_end timestamptz not null,
    service_interval tstzrange generated always as (tstzrange(service_start, service_end, '[)')) stored,
    consumes_capacity boolean not null default true,
    allocation_state text not null default 'ACTIVE',
    released_at timestamptz
  )`);
  pgm.sql(
    "alter table app.capacity_allocations add constraint capacity_allocation_booking_interval foreign key (booking_id, service_start, service_end) references app.bookings (booking_id, service_start, service_end) on delete restrict",
  );
  pgm.addConstraint({ schema: "app", name: "capacity_allocations" }, "capacity_allocation_state", {
    check: "(allocation_state = 'ACTIVE' and consumes_capacity and released_at is null) or (allocation_state = 'RELEASED' and not consumes_capacity and released_at is not null)",
  });
  pgm.addConstraint({ schema: "app", name: "capacity_allocations" }, "capacity_allocation_one_per_booking", {
    unique: ["booking_id"],
  });
  pgm.sql(
    "alter table app.capacity_allocations add constraint capacity_allocation_no_overlap exclude using gist (capacity_unit_id with =, service_interval with &&) where (consumes_capacity)",
  );
  pgm.sql("GRANT SELECT ON app.capacity_units TO lava_test");
  pgm.sql("GRANT INSERT, SELECT, UPDATE ON app.capacity_allocations TO lava_test");
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable({ schema: "app", name: "capacity_allocations" });
  pgm.dropConstraint({ schema: "app", name: "bookings" }, "bookings_service_interval_reference_unique");
  pgm.dropTable({ schema: "app", name: "capacity_units" });
}
