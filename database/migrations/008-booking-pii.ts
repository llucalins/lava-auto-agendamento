import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.addConstraint({ schema: "app", name: "bookings" }, "bookings_service_mode_reference_unique", {
    unique: ["booking_id", "service_mode"],
  });
  pgm.createTable({ schema: "app", name: "booking_customer_vehicle_pii" }, {
    booking_id: { type: "uuid", primaryKey: true },
    service_mode: { type: "text", notNull: true },
    full_name: { type: "text", notNull: true },
    phone_whatsapp: { type: "text", notNull: true },
    email: { type: "text" },
    cpf: { type: "text", notNull: true },
    vehicle_model: { type: "text", notNull: true },
    licence_plate: { type: "text", notNull: true },
    vehicle_color: { type: "text", notNull: true },
    pickup_address: { type: "text" },
  });
  pgm.sql(
    "alter table app.booking_customer_vehicle_pii add constraint booking_pii_booking_mode foreign key (booking_id, service_mode) references app.bookings (booking_id, service_mode) on delete restrict",
  );
  pgm.addConstraint({ schema: "app", name: "booking_customer_vehicle_pii" }, "booking_pii_required_fields", {
    check: "btrim(full_name) <> '' and btrim(phone_whatsapp) <> '' and btrim(cpf) <> '' and btrim(vehicle_model) <> '' and btrim(licence_plate) <> '' and btrim(vehicle_color) <> '' and (email is null or btrim(email) <> '')",
  });
  pgm.addConstraint({ schema: "app", name: "booking_customer_vehicle_pii" }, "booking_pii_pickup_address", {
    check: "(service_mode = 'PICKUP_REQUESTED' and pickup_address is not null and btrim(pickup_address) <> '') or (service_mode = 'DROP_OFF' and pickup_address is null)",
  });
  pgm.sql("GRANT INSERT, SELECT ON app.booking_customer_vehicle_pii TO lava_test");
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable({ schema: "app", name: "booking_customer_vehicle_pii" });
  pgm.dropConstraint({ schema: "app", name: "bookings" }, "bookings_service_mode_reference_unique");
}
