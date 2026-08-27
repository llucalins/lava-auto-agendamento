import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createScheduledBooking } from "../../src/server/capabilities/booking-lifecycle/repository";
import { createIntegrationPool } from "../support/postgres";

describe("booking aggregate and package snapshot", () => {
  it("derives the half-open service interval and immutable terms from the persisted package revision", async () => {
    const pool = createIntegrationPool();
    const packageId = randomUUID();
    const serviceStart = new Date("2026-09-06T14:30:00Z");

    await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
    await pool.query(
      "insert into app.service_package_revisions values ($1, 1, 'Complete', 'Wax', 12500, 45, 'ACTIVE')",
      [packageId],
    );

    const booking = await createScheduledBooking(pool, {
      packageId,
      serviceStart,
      serviceMode: "DROP_OFF",
      intendedPaymentMethod: "PIX",
    });

    expect(booking).toMatchObject({
      packageId,
      packageRevision: 1,
      status: "SCHEDULED",
      serviceStart: "2026-09-06T14:30:00.000Z",
      serviceEnd: "2026-09-06T15:15:00.000Z",
    });

    const snapshot = await pool.query<{
      package_id: string;
      package_revision: number;
      name: string;
      description: string | null;
      price_centavos: string;
      currency: string;
      duration_minutes: number;
    }>(
      "select package_id, package_revision, name, description, price_centavos::text, currency, duration_minutes from app.booking_package_snapshots where booking_id = $1",
      [booking.bookingId],
    );
    expect(snapshot.rows).toEqual([
      {
        package_id: packageId,
        package_revision: 1,
        name: "Complete",
        description: "Wax",
        price_centavos: "12500",
        currency: "BRL",
        duration_minutes: 45,
      },
    ]);

    await pool.query(
      "insert into app.service_package_revisions values ($1, 2, 'Complete v2', 'Wax plus', 15000, 60, 'ACTIVE')",
      [packageId],
    );
    const preserved = await pool.query(
      "select price_centavos::text, duration_minutes from app.booking_package_snapshots where booking_id = $1",
      [booking.bookingId],
    );
    expect(preserved.rows).toEqual([{ price_centavos: "12500", duration_minutes: 45 }]);
    await expect(
      pool.query(
        "update app.booking_package_snapshots set price_centavos = 1 where booking_id = $1",
        [booking.bookingId],
      ),
    ).rejects.toThrow();
    await pool.end();
  });
});
