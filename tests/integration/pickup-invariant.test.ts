import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createScheduledBooking } from "../../src/server/capabilities/booking-lifecycle/repository";
import {
  getBookingProjection,
  persistBookingPii,
} from "../../src/server/capabilities/booking-lifecycle/pii-repository";
import { createIntegrationPool, createMigrationIntegrationPool } from "../support/postgres";

describe("booking PII pickup invariant", () => {
  it("requires an address for pickup, retains none for drop-off, and keeps generic projections PII-free", async () => {
    const pool = createIntegrationPool();
    const migrationPool = createMigrationIntegrationPool();
    const packageId = randomUUID();
    await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
    await pool.query(
      "insert into app.service_package_revisions values ($1, 1, 'Basic', null, 5000, 30, 'ACTIVE')",
      [packageId],
    );

    const dropOff = await createScheduledBooking(pool, {
      packageId,
      serviceStart: new Date("2026-09-07T12:00:00Z"),
      serviceMode: "DROP_OFF",
      intendedPaymentMethod: "CASH",
    });
    await expect(
      persistBookingPii(pool, {
        bookingId: dropOff.bookingId,
        fullName: "Ana Silva",
        phoneWhatsapp: "83999990000",
        email: undefined,
        cpf: "12345678901",
        vehicleModel: "Hatch",
        licencePlate: "ABC1D23",
        vehicleColor: "Blue",
        pickupAddress: "Rua que não deve ser retida",
      }),
    ).rejects.toThrow("Booking PII is invalid.");
    await persistBookingPii(pool, {
      bookingId: dropOff.bookingId,
      fullName: "Ana Silva",
      phoneWhatsapp: "83999990000",
      email: undefined,
      cpf: "12345678901",
      vehicleModel: "Hatch",
      licencePlate: "ABC1D23",
      vehicleColor: "Blue",
      pickupAddress: undefined,
    });

    const pickup = await createScheduledBooking(pool, {
      packageId,
      serviceStart: new Date("2026-09-07T13:00:00Z"),
      serviceMode: "PICKUP_REQUESTED",
      intendedPaymentMethod: "PIX",
    });
    await expect(
      pool.query(
        "insert into app.booking_customer_vehicle_pii (booking_id, service_mode, full_name, phone_whatsapp, cpf, vehicle_model, licence_plate, vehicle_color, pickup_address) values ($1, 'PICKUP_REQUESTED', 'Ana Silva', '83999990000', '12345678901', 'Hatch', 'ABC1D23', 'Blue', null)",
        [pickup.bookingId],
      ),
    ).rejects.toThrow();
    await persistBookingPii(pool, {
      bookingId: pickup.bookingId,
      fullName: "Ana Silva",
      phoneWhatsapp: "83999990000",
      email: "ana@example.test",
      cpf: "12345678901",
      vehicleModel: "Hatch",
      licencePlate: "ABC1D23",
      vehicleColor: "Blue",
      pickupAddress: "Rua das Flores, 10",
    });

    const addresses = await migrationPool.query<{ booking_id: string; pickup_address: string | null }>(
      "select booking_id, pickup_address from app.booking_customer_vehicle_pii where booking_id in ($1, $2) order by booking_id",
      [dropOff.bookingId, pickup.bookingId],
    );
    expect(addresses.rows).toContainEqual({
      booking_id: dropOff.bookingId,
      pickup_address: null,
    });
    expect(addresses.rows).toContainEqual({
      booking_id: pickup.bookingId,
      pickup_address: "Rua das Flores, 10",
    });
    expect(await getBookingProjection(pool, dropOff.bookingId)).toEqual({
      bookingId: dropOff.bookingId,
      status: "SCHEDULED",
      serviceStart: "2026-09-07T12:00:00.000Z",
      serviceEnd: "2026-09-07T12:30:00.000Z",
    });
    await Promise.all([pool.end(), migrationPool.end()]);
  });
});
