import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import { transitionAdminBookingStatus, transitionAdminBookingStatusInTransaction } from "../../src/server/capabilities/admin-operations/status-transition";
import { withTransaction } from "../../src/server/persistence/transaction";
import { createIntegrationPool } from "../support/postgres";

describe("PostgreSQL audited admin booking status transitions", () => {
  const pools: ReturnType<typeof createIntegrationPool>[] = [];
  afterEach(async () => { await Promise.all(pools.splice(0).map((pool) => pool.end())); });

  it("transitions only through the approved states, audits both effects, and retains completed allocation history", async () => {
    const fixture = await createFixture();

    const started = await transitionAdminBookingStatus(fixture.pool, fixture.sessionCookie, { bookingId: fixture.bookingId, expectedRevision: 1, status: "IN_PROGRESS" });
    const completed = await transitionAdminBookingStatus(fixture.pool, fixture.sessionCookie, { bookingId: fixture.bookingId, expectedRevision: 2, status: "COMPLETED" });
    expect(started).toMatchObject({ status: "IN_PROGRESS", revision: 2 });
    expect(completed).toMatchObject({ status: "COMPLETED", revision: 3 });
    await expect(fixture.pool.query("select status, revision from app.bookings where booking_id = $1", [fixture.bookingId])).resolves.toMatchObject({ rows: [{ status: "COMPLETED", revision: 3 }] });
    await expect(fixture.pool.query("select allocation_state, consumes_capacity from app.capacity_allocations where booking_id = $1", [fixture.bookingId])).resolves.toMatchObject({ rows: [{ allocation_state: "ACTIVE", consumes_capacity: true }] });
    await expectDuplicateAuditEvent(fixture.pool, started.auditEventId, fixture.adminId, fixture.bookingId);
    await expectDuplicateAuditEvent(fixture.pool, completed.auditEventId, fixture.adminId, fixture.bookingId);
    await expect(fixture.pool.query("select event_id from app.audit_events where target_ref = $1", [fixture.bookingId])).rejects.toThrow();
  });

  it("rejects invalid and stale transitions without booking or audit effects", async () => {
    const fixture = await createFixture();

    await expect(transitionAdminBookingStatus(fixture.pool, fixture.sessionCookie, { bookingId: fixture.bookingId, expectedRevision: 1, status: "COMPLETED" })).rejects.toThrow("Invalid booking transition");
    await expect(transitionAdminBookingStatus(fixture.pool, fixture.sessionCookie, { bookingId: fixture.bookingId, expectedRevision: 1, status: "IN_PROGRESS" })).resolves.toMatchObject({ revision: 2 });
    await expect(transitionAdminBookingStatus(fixture.pool, fixture.sessionCookie, { bookingId: fixture.bookingId, expectedRevision: 1, status: "COMPLETED" })).rejects.toThrow("Invalid booking transition");
    await expect(fixture.pool.query("select status, revision from app.bookings where booking_id = $1", [fixture.bookingId])).resolves.toMatchObject({ rows: [{ status: "IN_PROGRESS", revision: 2 }] });
  });

  it("denies an IDOR-style request with a known booking UUID but no valid PostgreSQL session", async () => {
    const fixture = await createFixture();

    await expect(transitionAdminBookingStatus(fixture.pool, "A".repeat(43), { bookingId: fixture.bookingId, expectedRevision: 1, status: "IN_PROGRESS" })).rejects.toThrow("Forbidden");
    await expect(fixture.pool.query("select status, revision from app.bookings where booking_id = $1", [fixture.bookingId])).resolves.toMatchObject({ rows: [{ status: "SCHEDULED", revision: 1 }] });
  });

  it("rolls back the status effect and audit event together when the enclosing transaction fails", async () => {
    const fixture = await createFixture();
    let auditEventId = "";

    await expect(withTransaction(fixture.pool, async (client) => {
      auditEventId = (await transitionAdminBookingStatusInTransaction(client, fixture.sessionCookie, { bookingId: fixture.bookingId, expectedRevision: 1, status: "IN_PROGRESS" })).auditEventId;
      throw new Error("forced rollback");
    })).rejects.toThrow("forced rollback");
    await expect(fixture.pool.query("select status, revision from app.bookings where booking_id = $1", [fixture.bookingId])).resolves.toMatchObject({ rows: [{ status: "SCHEDULED", revision: 1 }] });
    await expect(fixture.pool.query(
      "insert into app.audit_events (event_id, category, action, outcome, schema_version, actor_ref, target_ref) values ($1, 'BOOKING_MUTATION', 'BOOKING_STATUS_UPDATED', 'SUCCEEDED', 1, $2, $3)",
      [auditEventId, fixture.adminId, fixture.bookingId],
    )).resolves.toBeDefined();
  });

  async function createFixture() {
    const pool = createIntegrationPool();
    pools.push(pool);
    const packageId = randomUUID();
    const bookingId = randomUUID();
    const adminId = randomUUID();
    const issuer = `https://${randomUUID()}.example.test`;
    const start = new Date(2_100_000_000_000 + (Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000) * 3_600_000);
    const end = new Date(start.getTime() + 30 * 60_000);
    await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
    await pool.query("insert into app.service_package_revisions values ($1, 1, 'Basic', null, 5000, 30, 'ACTIVE')", [packageId]);
    await pool.query("insert into app.bookings (booking_id, revision, status, service_start, service_end, package_id, package_revision, service_mode, intended_payment_method) values ($1, 1, 'SCHEDULED', $2, $3, $4, 1, 'DROP_OFF', 'PIX')", [bookingId, start, end, packageId]);
    await pool.query("insert into app.capacity_allocations (allocation_id, booking_id, capacity_unit_id, service_start, service_end) values ($1, $2, '00000000-0000-0000-0000-000000000001', $3, $4)", [randomUUID(), bookingId, start, end]);
    await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, 'employee', 'EMPLOYEE')", [adminId, issuer]);
    const session = await createLocalSession(pool, { issuer, subject: "employee", mfaAssured: true });
    return { pool, bookingId, adminId, sessionCookie: session.cookieValue };
  }
});

async function expectDuplicateAuditEvent(
  pool: ReturnType<typeof createIntegrationPool>,
  eventId: string,
  actorId: string,
  bookingId: string,
) {
  await expect(pool.query(
    "insert into app.audit_events (event_id, category, action, outcome, schema_version, actor_ref, target_ref) values ($1, 'BOOKING_MUTATION', 'BOOKING_STATUS_UPDATED', 'SUCCEEDED', 1, $2, $3)",
    [eventId, actorId, bookingId],
  )).rejects.toThrow();
}
