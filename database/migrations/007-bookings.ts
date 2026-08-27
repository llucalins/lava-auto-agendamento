import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable({ schema: "app", name: "bookings" }, {
    booking_id: { type: "uuid", primaryKey: true },
    revision: { type: "integer", notNull: true, default: 1 },
    status: { type: "text", notNull: true },
    service_start: { type: "timestamptz", notNull: true },
    service_end: { type: "timestamptz", notNull: true },
    package_id: { type: "uuid", notNull: true },
    package_revision: { type: "integer", notNull: true },
    service_mode: { type: "text", notNull: true },
    intended_payment_method: { type: "text", notNull: true },
  });
  pgm.addConstraint({ schema: "app", name: "bookings" }, "bookings_revision_positive", {
    check: "revision >= 1",
  });
  pgm.addConstraint({ schema: "app", name: "bookings" }, "bookings_service_interval", {
    check: "service_start < service_end",
  });
  pgm.addConstraint({ schema: "app", name: "bookings" }, "bookings_status", {
    check: "status in ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')",
  });
  pgm.addConstraint({ schema: "app", name: "bookings" }, "bookings_service_mode", {
    check: "service_mode in ('DROP_OFF', 'PICKUP_REQUESTED')",
  });
  pgm.addConstraint({ schema: "app", name: "bookings" }, "bookings_payment_method", {
    check: "intended_payment_method in ('PIX', 'CASH', 'CREDIT_CARD', 'DEBIT_CARD')",
  });
  pgm.sql(
    "alter table app.bookings add constraint bookings_package_revision foreign key (package_id, package_revision) references app.service_package_revisions (package_id, revision) on delete restrict",
  );
  pgm.addConstraint({ schema: "app", name: "bookings" }, "bookings_package_reference_unique", {
    unique: ["booking_id", "package_id", "package_revision"],
  });

  pgm.createTable({ schema: "app", name: "booking_package_snapshots" }, {
    booking_id: { type: "uuid", primaryKey: true },
    package_id: { type: "uuid", notNull: true },
    package_revision: { type: "integer", notNull: true },
    name: { type: "text", notNull: true },
    description: { type: "text" },
    price_centavos: { type: "bigint", notNull: true },
    currency: { type: "text", notNull: true, default: "'BRL'" },
    duration_minutes: { type: "integer", notNull: true },
  });
  pgm.sql(
    "alter table app.booking_package_snapshots add constraint booking_snapshot_booking_package foreign key (booking_id, package_id, package_revision) references app.bookings (booking_id, package_id, package_revision) on delete restrict",
  );
  pgm.addConstraint({ schema: "app", name: "booking_package_snapshots" }, "booking_snapshot_price_nonnegative", {
    check: "price_centavos >= 0",
  });
  pgm.addConstraint({ schema: "app", name: "booking_package_snapshots" }, "booking_snapshot_currency_brl", {
    check: "currency = 'BRL'",
  });
  pgm.addConstraint({ schema: "app", name: "booking_package_snapshots" }, "booking_snapshot_duration_positive_bounded", {
    check: "duration_minutes between 1 and 480",
  });
  pgm.sql("GRANT INSERT, SELECT ON app.bookings, app.booking_package_snapshots TO lava_test");
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable({ schema: "app", name: "booking_package_snapshots" });
  pgm.dropTable({ schema: "app", name: "bookings" });
}
