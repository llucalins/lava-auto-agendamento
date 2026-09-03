import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { runFixedRetention, runFixedRetentionInTransaction } from "../../src/server/capabilities/privacy/retention";
import { withTransaction } from "../../src/server/persistence/transaction";
import { createConcurrentIntegrationPool, createMigrationIntegrationPool } from "../support/postgres";

describe("fixed PostgreSQL retention jobs", () => {
  const pools: Pool[] = [];
  afterEach(async () => Promise.all(pools.splice(0).map((pool) => pool.end())));

  it("deletes only terminal PII older than 12 months and records no deleted values", async () => {
    const migration = use(createMigrationIntegrationPool());
    const runtime = use(createConcurrentIntegrationPool());
    const old = await createBooking(migration, "COMPLETED", "2024-12-01T00:00:00Z", "Old Synthetic Person");
    const recent = await createBooking(migration, "CANCELLED", "2025-10-01T00:00:00Z", "Recent Synthetic Person");
    const active = await createBooking(migration, "SCHEDULED", null, "Active Synthetic Person");

    const result = await runFixedRetention(migration, { executionId: randomUUID(), jobClass: "TERMINAL_PII_12_MONTHS", now: new Date("2026-09-02T12:00:00Z") });

    expect(result.deletedCount).toBe(1);
    const remaining = await migration.query<{ booking_id: string }>("select booking_id from app.booking_customer_vehicle_pii where booking_id = any($1::uuid[]) order by booking_id", [[old, recent, active]]);
    expect(remaining.rows.map((row) => row.booking_id).sort()).toEqual([recent, active].sort());
    const record = await migration.query("select * from app.retention_executions where execution_id = $1", [result.executionId]);
    expect(JSON.stringify(record.rows)).not.toMatch(/Old Synthetic Person|cpf|address|plate|phone|email/i);
    await expect(runtime.query("delete from app.booking_customer_vehicle_pii where booking_id = $1", [recent])).rejects.toThrow();
  });

  it("deletes minimized audit events older than 24 months and is idempotent by execution ID", async () => {
    const migration = use(createMigrationIntegrationPool());
    const oldId = randomUUID();
    const recentId = randomUUID();
    await insertAudit(migration, oldId, "2024-01-01T00:00:00Z");
    await insertAudit(migration, recentId, "2026-01-01T00:00:00Z");
    const command = { executionId: randomUUID(), jobClass: "AUDIT_24_MONTHS" as const, now: new Date("2026-09-02T12:00:00Z") };

    const first = await runFixedRetention(migration, command);
    const replay = await runFixedRetention(migration, command);

    expect(first).toEqual(replay);
    expect(first.deletedCount).toBeGreaterThanOrEqual(1);
    await expect(migration.query("select event_id from app.audit_events where event_id = $1", [oldId])).resolves.toMatchObject({ rowCount: 0 });
    await expect(migration.query("select event_id from app.audit_events where event_id = $1", [recentId])).resolves.toMatchObject({ rowCount: 1 });
  });

  it("rolls back deletion and execution metadata when interrupted, then retries safely", async () => {
    const migration = use(createMigrationIntegrationPool());
    const bookingId = await createBooking(migration, "COMPLETED", "2024-12-01T00:00:00Z", "Retry Synthetic Person");
    const command = { executionId: randomUUID(), jobClass: "TERMINAL_PII_12_MONTHS" as const, now: new Date("2026-09-02T12:00:00Z") };

    await expect(withTransaction(migration, async (client) => {
      await runFixedRetentionInTransaction(client, command);
      throw new Error("synthetic interruption");
    })).rejects.toThrow("synthetic interruption");
    expect((await migration.query("select 1 from app.booking_customer_vehicle_pii where booking_id = $1", [bookingId])).rowCount).toBe(1);
    expect((await migration.query("select 1 from app.retention_executions where execution_id = $1", [command.executionId])).rowCount).toBe(0);

    await expect(runFixedRetention(migration, command)).resolves.toMatchObject({ deletedCount: 1 });
  });

  function use<T extends Pool>(pool: T): T { pools.push(pool); return pool; }
});

async function createBooking(pool: Pool, status: "SCHEDULED" | "COMPLETED" | "CANCELLED", terminalAt: string | null, fullName: string) {
  const packageId = randomUUID();
  const bookingId = randomUUID();
  const start = new Date("2026-10-01T12:00:00Z");
  await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
  await pool.query("insert into app.service_package_revisions values ($1, 1, 'Retention', null, 5000, 30, 'ACTIVE')", [packageId]);
  await pool.query(`insert into app.bookings (booking_id, status, terminal_transition_at, service_start, service_end, package_id, package_revision, service_mode, intended_payment_method)
    values ($1, $2, $3, $4, $5, $6, 1, 'DROP_OFF', 'PIX')`, [bookingId, status, terminalAt, start, new Date(start.getTime() + 1_800_000), packageId]);
  await pool.query(`insert into app.booking_customer_vehicle_pii
    (booking_id, service_mode, full_name, phone_whatsapp, cpf, vehicle_model, licence_plate, vehicle_color)
    values ($1, 'DROP_OFF', $2, '85000000000', '12345678909', 'Hatch', 'ABC1D23', 'Prata')`, [bookingId, fullName]);
  return bookingId;
}

async function insertAudit(pool: Pool, eventId: string, occurredAt: string) {
  await pool.query(`insert into app.audit_events
    (event_id, occurred_at, category, action, outcome, schema_version, actor_ref, target_ref)
    values ($1, $2, 'SECURITY_FAILURE', 'RETENTION_TEST', 'SUCCEEDED', 1, $3, $4)`,
  [eventId, occurredAt, randomUUID(), randomUUID()]);
}
