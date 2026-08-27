import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  allocateBookingCapacity,
  releaseCancelledBookingCapacity,
} from "../../src/server/capabilities/booking-lifecycle/allocations";
import { createIntegrationPool } from "../support/postgres";

describe("capacity allocation integrity", () => {
  it("enforces half-open N=1 allocations and releases only cancelled bookings once", async () => {
    const pool = createIntegrationPool();
    const packageId = randomUUID();
    await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
    await pool.query(
      "insert into app.service_package_revisions values ($1, 1, 'Basic', null, 5000, 30, 'ACTIVE')",
      [packageId],
    );

    const scheduled = randomUUID();
    const overlapping = randomUUID();
    const backToBack = randomUUID();
    const inProgress = randomUUID();
    const cancelled = randomUUID();
    const completed = randomUUID();
    const firstStart = new Date(
      2_000_000_000_000 + (Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000) * 3_600_000,
    );
    const interval = (hours: number) =>
      new Date(firstStart.getTime() + hours * 3_600_000).toISOString();
    await pool.query(
      `insert into app.bookings (booking_id, revision, status, service_start, service_end, package_id, package_revision, service_mode, intended_payment_method)
       values
       ($1, 1, 'SCHEDULED', $8, $9, $7, 1, 'DROP_OFF', 'PIX'),
       ($2, 1, 'SCHEDULED', $10, $11, $7, 1, 'DROP_OFF', 'PIX'),
       ($3, 1, 'SCHEDULED', $9, $12, $7, 1, 'DROP_OFF', 'PIX'),
       ($4, 1, 'IN_PROGRESS', $12, $13, $7, 1, 'DROP_OFF', 'PIX'),
       ($5, 1, 'CANCELLED', $13, $14, $7, 1, 'DROP_OFF', 'PIX'),
       ($6, 1, 'COMPLETED', $14, $15, $7, 1, 'DROP_OFF', 'PIX')`,
      [
        scheduled,
        overlapping,
        backToBack,
        inProgress,
        cancelled,
        completed,
        packageId,
        interval(0),
        interval(1),
        interval(0.5),
        interval(1.5),
        interval(2),
        interval(3),
        interval(4),
        interval(5),
      ],
    );

    await expect(allocateBookingCapacity(pool, scheduled)).resolves.toBeDefined();
    await expect(allocateBookingCapacity(pool, overlapping)).rejects.toThrow();
    await expect(allocateBookingCapacity(pool, backToBack)).resolves.toBeDefined();
    await expect(allocateBookingCapacity(pool, inProgress)).resolves.toBeDefined();
    await expect(allocateBookingCapacity(pool, cancelled)).resolves.toBeUndefined();
    await expect(allocateBookingCapacity(pool, completed)).resolves.toBeUndefined();

    await pool.query(
      `insert into app.capacity_allocations (allocation_id, booking_id, capacity_unit_id, service_start, service_end)
       select $1, $2, capacity_unit_id, $3, $4
       from app.capacity_units where state = 'ACTIVE'`,
      [randomUUID(), cancelled, interval(3), interval(4)],
    );
    await pool.query(
      `insert into app.capacity_allocations (allocation_id, booking_id, capacity_unit_id, service_start, service_end)
       select $1, $2, capacity_unit_id, $3, $4
       from app.capacity_units where state = 'ACTIVE'`,
      [randomUUID(), completed, interval(4), interval(5)],
    );
    await expect(releaseCancelledBookingCapacity(pool, cancelled)).resolves.toBe(true);
    await expect(releaseCancelledBookingCapacity(pool, cancelled)).resolves.toBe(false);
    await expect(releaseCancelledBookingCapacity(pool, completed)).resolves.toBe(false);

    const allocations = await pool.query<{
      booking_id: string;
      consumes_capacity: boolean;
      allocation_state: string;
    }>(
      "select booking_id, consumes_capacity, allocation_state from app.capacity_allocations where booking_id in ($1, $2)",
      [cancelled, completed],
    );
    expect(allocations.rows).toContainEqual({
      booking_id: cancelled,
      consumes_capacity: false,
      allocation_state: "RELEASED",
    });
    expect(allocations.rows).toContainEqual({
      booking_id: completed,
      consumes_capacity: true,
      allocation_state: "ACTIVE",
    });
    await pool.end();
  });
});
