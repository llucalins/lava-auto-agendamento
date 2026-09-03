import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import {
  cancelAdminBooking,
  cancelAdminBookingInTransaction,
} from "../../src/server/capabilities/admin-operations/cancel-booking";
import { withTransaction } from "../../src/server/persistence/transaction";
import { createConcurrentIntegrationPool } from "../support/postgres";

describe("PostgreSQL audited admin booking cancellation", () => {
  const pools: Pool[] = [];

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
  });

  it("cancels SCHEDULED once and commits one capacity release with one minimized audit", async () => {
    const fixture = await createFixture();

    const cancelled = await cancelAdminBooking(fixture.pool, fixture.sessionCookie, {
      bookingId: fixture.bookingId,
      expectedRevision: 1,
    });

    expect(cancelled).toMatchObject({ status: "CANCELLED", revision: 2 });
    await expectBooking(fixture.pool, fixture.bookingId, "CANCELLED", 2);
    await expectAllocation(fixture.pool, fixture.bookingId, "RELEASED", false);
    await expectAudit(fixture.auditPool, fixture.bookingId, fixture.adminId, 1);

    await expect(cancelAdminBooking(fixture.pool, fixture.sessionCookie, {
      bookingId: fixture.bookingId,
      expectedRevision: 1,
    })).rejects.toThrow("Invalid booking cancellation");

    await expectBooking(fixture.pool, fixture.bookingId, "CANCELLED", 2);
    await expectAllocation(fixture.pool, fixture.bookingId, "RELEASED", false);
    await expectAudit(fixture.auditPool, fixture.bookingId, fixture.adminId, 1);
  });

  it("denies a known booking UUID without a valid PostgreSQL session", async () => {
    const fixture = await createFixture();

    await expect(cancelAdminBooking(fixture.pool, "A".repeat(43), {
      bookingId: fixture.bookingId,
      expectedRevision: 1,
    })).rejects.toThrow("Forbidden");

    await expectBooking(fixture.pool, fixture.bookingId, "SCHEDULED", 1);
    await expectAllocation(fixture.pool, fixture.bookingId, "ACTIVE", true);
    await expectAudit(fixture.auditPool, fixture.bookingId, fixture.adminId, 0);
  });

  it("rejects stale revisions and IN_PROGRESS cancellation without effects", async () => {
    const stale = await createFixture();
    await expect(cancelAdminBooking(stale.pool, stale.sessionCookie, {
      bookingId: stale.bookingId,
      expectedRevision: 2,
    })).rejects.toThrow("Invalid booking cancellation");
    await expectBooking(stale.pool, stale.bookingId, "SCHEDULED", 1);
    await expectAllocation(stale.pool, stale.bookingId, "ACTIVE", true);
    await expectAudit(stale.auditPool, stale.bookingId, stale.adminId, 0);

    const inProgress = await createFixture("IN_PROGRESS");
    await expect(cancelAdminBooking(inProgress.pool, inProgress.sessionCookie, {
      bookingId: inProgress.bookingId,
      expectedRevision: 1,
    })).rejects.toThrow("Invalid booking cancellation");
    await expectBooking(inProgress.pool, inProgress.bookingId, "IN_PROGRESS", 1);
    await expectAllocation(inProgress.pool, inProgress.bookingId, "ACTIVE", true);
    await expectAudit(inProgress.auditPool, inProgress.bookingId, inProgress.adminId, 0);
  });

  it("rolls back booking, allocation, and audit together when the outcome is not committed", async () => {
    const fixture = await createFixture();

    await expect(withTransaction(fixture.pool, async (client) => {
      await cancelAdminBookingInTransaction(client, fixture.sessionCookie, {
        bookingId: fixture.bookingId,
        expectedRevision: 1,
      });
      throw new Error("forced rollback");
    })).rejects.toThrow("forced rollback");

    await expectBooking(fixture.pool, fixture.bookingId, "SCHEDULED", 1);
    await expectAllocation(fixture.pool, fixture.bookingId, "ACTIVE", true);
    await expectAudit(fixture.auditPool, fixture.bookingId, fixture.adminId, 0);
  });

  it("serializes concurrent cancellation contenders and commits exactly one outcome", async () => {
    const fixture = await createFixture();
    const first = await fixture.pool.connect();
    const second = await fixture.pool.connect();

    try {
      await first.query("begin");
      await first.query("select booking_id from app.bookings where booking_id = $1 for update", [fixture.bookingId]);
      await second.query("begin");
      const backend = await second.query<{ backendPid: number }>('select pg_backend_pid() as "backendPid"');
      const secondAttempt = cancelAdminBookingInTransaction(second, fixture.sessionCookie, {
        bookingId: fixture.bookingId,
        expectedRevision: 1,
      });
      await waitForLock(fixture.pool, backend.rows[0]!.backendPid);

      const firstResult = await cancelAdminBookingInTransaction(first, fixture.sessionCookie, {
        bookingId: fixture.bookingId,
        expectedRevision: 1,
      });
      await first.query("commit");

      expect(firstResult).toMatchObject({ status: "CANCELLED", revision: 2 });
      await expect(secondAttempt).rejects.toThrow("Invalid booking cancellation");
      await second.query("rollback");
      await expectBooking(fixture.pool, fixture.bookingId, "CANCELLED", 2);
      await expectAllocation(fixture.pool, fixture.bookingId, "RELEASED", false);
      await expectAudit(fixture.auditPool, fixture.bookingId, fixture.adminId, 1);
    } finally {
      await first.query("rollback").catch(() => undefined);
      await second.query("rollback").catch(() => undefined);
      first.release();
      second.release();
    }
  });

  async function createFixture(status: "SCHEDULED" | "IN_PROGRESS" = "SCHEDULED") {
    const pool = createConcurrentIntegrationPool();
    const auditPool = createAuditObserverPool();
    pools.push(pool, auditPool);
    const packageId = randomUUID();
    const bookingId = randomUUID();
    const adminId = randomUUID();
    const issuer = `https://${randomUUID()}.example.test`;
    const start = new Date(2_500_000_000_000 + (Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000) * 3_600_000);
    const end = new Date(start.getTime() + 30 * 60_000);

    await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
    await pool.query("insert into app.service_package_revisions values ($1, 1, 'Basic', null, 5000, 30, 'ACTIVE')", [packageId]);
    await pool.query(
      "insert into app.bookings (booking_id, revision, status, service_start, service_end, package_id, package_revision, service_mode, intended_payment_method) values ($1, 1, $2, $3, $4, $5, 1, 'DROP_OFF', 'PIX')",
      [bookingId, status, start, end, packageId],
    );
    await pool.query(
      "insert into app.capacity_allocations (allocation_id, booking_id, capacity_unit_id, service_start, service_end) values ($1, $2, '00000000-0000-0000-0000-000000000001', $3, $4)",
      [randomUUID(), bookingId, start, end],
    );
    await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, 'employee', 'EMPLOYEE')", [adminId, issuer]);
    const session = await createLocalSession(pool, { issuer, subject: "employee", mfaAssured: true });

    return { pool, auditPool, bookingId, adminId, sessionCookie: session.cookieValue };
  }
});

function createAuditObserverPool(): Pool {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required for cancellation audit verification.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 1 });
}

async function expectBooking(pool: Pool, bookingId: string, status: string, revision: number): Promise<void> {
  await expect(pool.query("select status, revision from app.bookings where booking_id = $1", [bookingId]))
    .resolves.toMatchObject({ rows: [{ status, revision }] });
}

async function expectAllocation(pool: Pool, bookingId: string, allocationState: string, consumesCapacity: boolean): Promise<void> {
  await expect(pool.query(
    'select allocation_state as "allocationState", consumes_capacity as "consumesCapacity" from app.capacity_allocations where booking_id = $1',
    [bookingId],
  )).resolves.toMatchObject({ rows: [{ allocationState, consumesCapacity }] });
}

async function expectAudit(auditPool: Pool, bookingId: string, adminId: string, count: number): Promise<void> {
  await expect(auditPool.query(
    `select actor_ref as "actorRef", action, outcome, reason_code as "reasonCode"
     from app.audit_events
     where target_ref = $1 and action = 'BOOKING_CANCELLED'`,
    [bookingId],
  )).resolves.toMatchObject({
    rows: count === 0 ? [] : [{
      actorRef: adminId,
      action: "BOOKING_CANCELLED",
      outcome: "SUCCEEDED",
      reasonCode: "SCHEDULED_TO_CANCELLED",
    }],
  });
}

async function waitForLock(pool: Pool, backendPid: number): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ waitEventType: string | null }>(
      'select wait_event_type as "waitEventType" from pg_stat_activity where pid = $1',
      [backendPid],
    );
    if (result.rows[0]?.waitEventType === "Lock") return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Concurrent cancellation contender did not wait for PostgreSQL.");
}
