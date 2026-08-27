import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import {
  allocateBookingCapacity,
  releaseCancelledBookingCapacity,
} from "../../src/server/capabilities/booking-lifecycle/allocations";
import { createConcurrentIntegrationPool } from "../support/postgres";

type Queryable = Pick<Pool, "query">;

async function createPackage(queryable: Queryable): Promise<string> {
  const packageId = randomUUID();
  await queryable.query("insert into app.service_packages values ($1, 1)", [packageId]);
  await queryable.query(
    "insert into app.service_package_revisions values ($1, 1, 'Concurrency', null, 5000, 30, 'ACTIVE')",
    [packageId],
  );
  return packageId;
}

async function createBooking(
  queryable: Queryable,
  input: Readonly<{ packageId: string; start: string; end: string; status: "SCHEDULED" | "CANCELLED" }>,
): Promise<string> {
  const bookingId = randomUUID();
  await queryable.query(
    `insert into app.bookings (
       booking_id, revision, status, service_start, service_end,
       package_id, package_revision, service_mode, intended_payment_method
     ) values ($1, 1, $2, $3, $4, $5, 1, 'DROP_OFF', 'PIX')`,
    [bookingId, input.status, input.start, input.end, input.packageId],
  );
  return bookingId;
}

async function begin(client: PoolClient): Promise<void> {
  await client.query("begin");
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query("rollback").catch(() => undefined);
}

async function waitForCapacityLock(pool: Queryable, backendPid: number): Promise<void> {
  const deadline = Date.now() + 1_000;

  while (Date.now() < deadline) {
    const result = await pool.query<{ waitEventType: string | null }>(
      `select wait_event_type as "waitEventType"
       from pg_stat_activity
       where pid = $1`,
      [backendPid],
    );
    if (result.rows[0]?.waitEventType === "Lock") {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Concurrent capacity contender did not wait for PostgreSQL.");
}

describe("capacity allocation concurrency", () => {
  it("allows one of two overlapping contenders to commit and leaves one active allocation", async () => {
    const pool = createConcurrentIntegrationPool();
    const firstClient = await pool.connect();
    const secondClient = await pool.connect();

    try {
      const packageId = await createPackage(pool);
      const firstStart = new Date(
        2_100_000_000_000 + (Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000) * 3_600_000,
      );
      const start = firstStart.toISOString();
      const end = new Date(firstStart.getTime() + 30 * 60_000).toISOString();
      const firstBooking = await createBooking(pool, { packageId, start, end, status: "SCHEDULED" });
      const secondBooking = await createBooking(pool, { packageId, start, end, status: "SCHEDULED" });

      await begin(firstClient);
      await expect(allocateBookingCapacity(firstClient, firstBooking)).resolves.toBeDefined();

      await begin(secondClient);
      const backend = await secondClient.query<{ backendPid: number }>(
        'select pg_backend_pid() as "backendPid"',
      );
      const secondAttempt = allocateBookingCapacity(secondClient, secondBooking);
      await waitForCapacityLock(pool, backend.rows[0]!.backendPid);

      await firstClient.query("commit");
      await expect(secondAttempt).rejects.toMatchObject({ code: "23P01" });
      await rollback(secondClient);

      const allocations = await pool.query<{ booking_id: string }>(
        `select booking_id
         from app.capacity_allocations
         where booking_id in ($1, $2) and consumes_capacity`,
        [firstBooking, secondBooking],
      );
      expect(allocations.rows).toEqual([{ booking_id: firstBooking }]);
    } finally {
      await rollback(firstClient);
      await rollback(secondClient);
      firstClient.release();
      secondClient.release();
      await pool.end();
    }
  });

  it("commits back-to-back contenders concurrently", async () => {
    const pool = createConcurrentIntegrationPool();
    const firstClient = await pool.connect();
    const secondClient = await pool.connect();

    try {
      const packageId = await createPackage(pool);
      const firstStart = new Date(
        2_200_000_000_000 + (Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000) * 3_600_000,
      );
      const boundary = new Date(firstStart.getTime() + 30 * 60_000);
      const end = new Date(boundary.getTime() + 30 * 60_000);
      const firstBooking = await createBooking(pool, {
        packageId,
        start: firstStart.toISOString(),
        end: boundary.toISOString(),
        status: "SCHEDULED",
      });
      const secondBooking = await createBooking(pool, {
        packageId,
        start: boundary.toISOString(),
        end: end.toISOString(),
        status: "SCHEDULED",
      });

      await Promise.all([begin(firstClient), begin(secondClient)]);
      const allocations = await Promise.all([
        allocateBookingCapacity(firstClient, firstBooking),
        allocateBookingCapacity(secondClient, secondBooking),
      ]);
      await Promise.all([firstClient.query("commit"), secondClient.query("commit")]);

      expect(allocations).toEqual([expect.any(String), expect.any(String)]);
    } finally {
      await rollback(firstClient);
      await rollback(secondClient);
      firstClient.release();
      secondClient.release();
      await pool.end();
    }
  });

  it("releases cancelled capacity before a concurrent new confirmation commits", async () => {
    const pool = createConcurrentIntegrationPool();
    const cancellationClient = await pool.connect();
    const confirmationClient = await pool.connect();

    try {
      const packageId = await createPackage(pool);
      const firstStart = new Date(
        2_300_000_000_000 + (Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000) * 3_600_000,
      );
      const start = firstStart.toISOString();
      const end = new Date(firstStart.getTime() + 30 * 60_000).toISOString();
      const cancelledBooking = await createBooking(pool, { packageId, start, end, status: "CANCELLED" });
      const newBooking = await createBooking(pool, { packageId, start, end, status: "SCHEDULED" });
      await pool.query(
        `insert into app.capacity_allocations (
           allocation_id, booking_id, capacity_unit_id, service_start, service_end
         ) select $1, $2, capacity_unit_id, $3, $4
           from app.capacity_units where state = 'ACTIVE'`,
        [randomUUID(), cancelledBooking, start, end],
      );

      await begin(cancellationClient);
      await expect(releaseCancelledBookingCapacity(cancellationClient, cancelledBooking)).resolves.toBe(true);

      await begin(confirmationClient);
      const backend = await confirmationClient.query<{ backendPid: number }>(
        'select pg_backend_pid() as "backendPid"',
      );
      const confirmation = allocateBookingCapacity(confirmationClient, newBooking);
      await waitForCapacityLock(pool, backend.rows[0]!.backendPid);
      await cancellationClient.query("commit");
      await expect(confirmation).resolves.toBeDefined();
      await confirmationClient.query("commit");

      const allocations = await pool.query<{
        allocation_state: string;
        booking_id: string;
        consumes_capacity: boolean;
      }>(
        `select booking_id, consumes_capacity, allocation_state
         from app.capacity_allocations
         where booking_id in ($1, $2)
         order by booking_id`,
        [cancelledBooking, newBooking],
      );
      expect(allocations.rows).toContainEqual({
        booking_id: cancelledBooking,
        consumes_capacity: false,
        allocation_state: "RELEASED",
      });
      expect(allocations.rows).toContainEqual({
        booking_id: newBooking,
        consumes_capacity: true,
        allocation_state: "ACTIVE",
      });
    } finally {
      await rollback(cancellationClient);
      await rollback(confirmationClient);
      cancellationClient.release();
      confirmationClient.release();
      await pool.end();
    }
  });

  it("keeps cancelled capacity authoritative when the concurrent release rolls back", async () => {
    const pool = createConcurrentIntegrationPool();
    const cancellationClient = await pool.connect();
    const confirmationClient = await pool.connect();

    try {
      const packageId = await createPackage(pool);
      const firstStart = new Date(
        2_400_000_000_000 + (Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000) * 3_600_000,
      );
      const start = firstStart.toISOString();
      const end = new Date(firstStart.getTime() + 30 * 60_000).toISOString();
      const cancelledBooking = await createBooking(pool, { packageId, start, end, status: "CANCELLED" });
      const newBooking = await createBooking(pool, { packageId, start, end, status: "SCHEDULED" });
      await pool.query(
        `insert into app.capacity_allocations (
           allocation_id, booking_id, capacity_unit_id, service_start, service_end
         ) select $1, $2, capacity_unit_id, $3, $4
           from app.capacity_units where state = 'ACTIVE'`,
        [randomUUID(), cancelledBooking, start, end],
      );

      await begin(cancellationClient);
      await expect(releaseCancelledBookingCapacity(cancellationClient, cancelledBooking)).resolves.toBe(true);

      await begin(confirmationClient);
      const backend = await confirmationClient.query<{ backendPid: number }>(
        'select pg_backend_pid() as "backendPid"',
      );
      const confirmation = allocateBookingCapacity(confirmationClient, newBooking);
      await waitForCapacityLock(pool, backend.rows[0]!.backendPid);
      await cancellationClient.query("rollback");
      await expect(confirmation).rejects.toMatchObject({ code: "23P01" });
      await rollback(confirmationClient);

      const allocations = await pool.query<{
        allocation_state: string;
        booking_id: string;
        consumes_capacity: boolean;
      }>(
        `select booking_id, consumes_capacity, allocation_state
         from app.capacity_allocations
         where booking_id in ($1, $2)
         order by booking_id`,
        [cancelledBooking, newBooking],
      );
      expect(allocations.rows).toEqual([
        {
          booking_id: cancelledBooking,
          consumes_capacity: true,
          allocation_state: "ACTIVE",
        },
      ]);
    } finally {
      await rollback(cancellationClient);
      await rollback(confirmationClient);
      cancellationClient.release();
      confirmationClient.release();
      await pool.end();
    }
  });
});
