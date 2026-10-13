import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { confirmBooking } from "../../src/server/capabilities/booking-lifecycle/confirm";
import { createBookingReview } from "../../src/server/capabilities/public-booking-flow/review";
import { createConcurrentIntegrationPool, createIntegrationPool } from "../support/postgres";

const fingerprintKey = "test-only-confirmation-fingerprint-key";
const intentKey = () => `intent-key-${randomUUID().replace(/-/g, "")}`;

function serviceStart(): Date {
  const start = new Date(
    2_500_000_000_000 + (Number.parseInt(randomUUID().slice(0, 8), 16) % 100_000) * 7 * 24 * 60 * 60_000,
  );
  start.setUTCDate(start.getUTCDate() + ((7 - start.getUTCDay()) % 7));
  start.setUTCHours(12, 0, 0, 0);
  return start;
}

async function createPackage(pool: Pick<Pool, "query">): Promise<string> {
  await pool.query("insert into app.operating_calendar default values on conflict do nothing");
  await pool.query(
    "insert into app.calendar_recurring_windows values (0, '08:00', '12:00', 1) on conflict do nothing",
  );
  const packageId = randomUUID();
  await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
  await pool.query(
    "insert into app.service_package_revisions values ($1, 1, 'Confirmation', null, 12500, 30, 'ACTIVE')",
    [packageId],
  );
  return packageId;
}

async function command(pool: Pick<Pool, "query">, packageId: string, start: Date, key = intentKey()) {
  const review = await createBookingReview(pool, { packageId, serviceStart: start }, fingerprintKey);
  if (review.kind !== "READY") throw new Error("Expected selectable test fixture.");
  return {
    intentKey: key,
    fingerprintKey,
    expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    material: {
      packageId,
      serviceStart: start,
      serviceMode: "PICKUP_REQUESTED" as const,
      intendedPaymentMethod: "PIX" as const,
      fullName: "Ana Silva",
      phoneWhatsapp: "83999990000",
      email: "ana@example.test",
      cpf: "12345678901",
      vehicleModel: "Hatch",
      licencePlate: "ABC1D23",
      vehicleColor: "Blue",
      pickupAddress: "Rua das Flores, 10",
      reviewToken: review.reviewToken,
    },
  };
}

async function waitForIntentLock(pool: Pick<Pool, "query">): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    const waiters = await pool.query<{ count: string }>(
      `select count(*)::text as count
       from pg_stat_activity
       where wait_event_type = 'Lock'
         and query like '%pg_advisory_xact_lock%'`,
    );
    if (waiters.rows[0]?.count === "2") {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Confirmation contenders did not concurrently wait in PostgreSQL.");
}

describe("atomic confirmation recovery", () => {
  it("commits authoritative effects once, replays them, and rejects material mismatch", async () => {
    const pool = createIntegrationPool();
    const packageId = await createPackage(pool);
    const request = await command(pool, packageId, serviceStart());

    try {
      const first = await confirmBooking(pool, request);
      expect(first).toMatchObject({ kind: "CONFIRMED", replayed: false });
      const replay = await confirmBooking(pool, request);
      expect(replay).toEqual({ ...first, replayed: true });
      await expect(
        confirmBooking(pool, {
          ...request,
          material: { ...request.material, intendedPaymentMethod: "CASH" },
        }),
      ).resolves.toEqual({ kind: "IDEMPOTENCY_CONFLICT" });

      const state = await pool.query<{
        allocations: string;
        bookings: string;
        intents: string;
        pii: string;
      }>(
        `select
           (select count(*) from app.bookings where package_id = $1)::text as bookings,
           (select count(*) from app.capacity_allocations allocation join app.bookings booking using (booking_id) where booking.package_id = $1)::text as allocations,
           (select count(*) from app.booking_customer_vehicle_pii pii join app.bookings booking using (booking_id) where booking.package_id = $1)::text as pii,
           (select count(*) from app.confirmation_intents where intent_key = $2)::text as intents`,
        [packageId, request.intentKey],
      );
      expect(state.rows[0]).toEqual({ bookings: "1", allocations: "1", pii: "1", intents: "1" });
    } finally {
      await pool.end();
    }
  });

  it("rolls back a losing capacity attempt before recording a sanitized rejection", async () => {
    const pool = createIntegrationPool();
    const packageId = await createPackage(pool);
    const start = serviceStart();
    const winner = await command(pool, packageId, start);
    const loser = await command(pool, packageId, start);

    try {
      await expect(confirmBooking(pool, winner)).resolves.toMatchObject({ kind: "CONFIRMED" });
      await expect(confirmBooking(pool, loser)).resolves.toEqual({
        kind: "REJECTED",
        code: "CAPACITY_UNAVAILABLE",
        replayed: false,
      });

      const state = await pool.query<{ allocations: string; bookings: string; pii: string }>(
        `select
           (select count(*) from app.bookings where package_id = $1)::text as bookings,
           (select count(*) from app.capacity_allocations allocation join app.bookings booking using (booking_id) where booking.package_id = $1)::text as allocations,
           (select count(*) from app.booking_customer_vehicle_pii pii join app.bookings booking using (booking_id) where booking.package_id = $1)::text as pii`,
        [packageId],
      );
      expect(state.rows[0]).toEqual({ bookings: "1", allocations: "1", pii: "1" });
      const loserIntent = await pool.query<{ booking_id: string | null; outcome_projection: Record<string, string> }>(
        "select booking_id, outcome_projection from app.confirmation_intents where intent_key = $1",
        [loser.intentKey],
      );
      expect(loserIntent.rows).toEqual([
        { booking_id: null, outcome_projection: { code: "CAPACITY_UNAVAILABLE" } },
      ]);
    } finally {
      await pool.end();
    }
  });

  it("serializes concurrent same-key confirmation contenders in PostgreSQL", async () => {
    const pool = createConcurrentIntegrationPool();
    const packageId = await createPackage(pool);
    const request = await command(pool, packageId, serviceStart());
    const lockClient = await pool.connect();

    try {
      await lockClient.query("begin");
      await lockClient.query(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`public.booking.confirm:${request.intentKey}`],
      );
      const first = confirmBooking(pool, request);
      const second = confirmBooking(pool, request);
      await waitForIntentLock(pool);
      await lockClient.query("commit");

      const outcomes = await Promise.all([first, second]);
      expect(outcomes).toContainEqual(expect.objectContaining({ kind: "CONFIRMED", replayed: false }));
      expect(outcomes).toContainEqual(expect.objectContaining({ kind: "CONFIRMED", replayed: true }));
      const state = await pool.query<{ allocations: string; bookings: string; intents: string; pii: string }>(
        `select
           (select count(*) from app.bookings where package_id = $1)::text as bookings,
           (select count(*) from app.capacity_allocations allocation join app.bookings booking using (booking_id) where booking.package_id = $1)::text as allocations,
           (select count(*) from app.booking_customer_vehicle_pii pii join app.bookings booking using (booking_id) where booking.package_id = $1)::text as pii,
           (select count(*) from app.confirmation_intents where intent_key = $2)::text as intents`,
        [packageId, request.intentKey],
      );
      expect(state.rows[0]).toEqual({ bookings: "1", allocations: "1", pii: "1", intents: "1" });
    } finally {
      await lockClient.query("rollback").catch(() => undefined);
      lockClient.release();
      await pool.end();
    }
  });

  it("rejects confirmation when package terms change after review", async () => {
    const pool = createIntegrationPool();
    const packageId = await createPackage(pool);
    const request = await command(pool, packageId, serviceStart());

    try {
      await pool.query(
        "insert into app.service_package_revisions values ($1, 2, 'Confirmation revised', null, 15000, 45, 'ACTIVE')",
        [packageId],
      );
      await pool.query("update app.service_packages set current_revision = 2 where package_id = $1", [packageId]);

      await expect(confirmBooking(pool, request)).resolves.toEqual({
        kind: "REJECTED",
        code: "STALE_PACKAGE",
        replayed: false,
      });
      const bookings = await pool.query<{ count: string }>(
        "select count(*)::text as count from app.bookings where package_id = $1",
        [packageId],
      );
      expect(bookings.rows[0]?.count).toBe("0");
    } finally {
      await pool.end();
    }
  });
});
