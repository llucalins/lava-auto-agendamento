import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadMetadataRetentionPolicy,
  runMetadataRetention,
  runMetadataRetentionInTransaction,
} from "../../src/server/capabilities/privacy/metadata-retention";
import { withTransaction } from "../../src/server/persistence/transaction";
import { createConcurrentIntegrationPool, createMigrationIntegrationPool } from "../support/postgres";

describe("bounded metadata retention", () => {
  const pools: Pool[] = [];
  afterEach(async () => Promise.all(pools.splice(0).map((pool) => pool.end())));

  it("fails closed until every unresolved duration has explicit approval", () => {
    const policy = loadMetadataRetentionPolicy({});
    expect(policy.IDEMPOTENCY_LINKED_PII_CAP.enabled).toBe(true);
    expect(policy.REJECTED_CONFIRMATION_INTENTS.enabled).toBe(false);
    expect(policy.TRACKING_SESSIONS.enabled).toBe(false);
    expect(policy.TRACKING_VERIFIERS.enabled).toBe(false);
    expect(policy.ABUSE_SIGNALS.enabled).toBe(false);
    expect(() => loadMetadataRetentionPolicy({ TRACKING_SESSION_RETENTION_DAYS: "30" })).toThrow(/not approved/);
    expect(() => loadMetadataRetentionPolicy({ REJECTED_INTENT_RETENTION_DAYS: "30" })).toThrow(/not approved/);
    expect(loadMetadataRetentionPolicy({
      TRACKING_SESSION_RETENTION_DAYS: "30",
      TRACKING_SESSION_RETENTION_APPROVED: "true",
    }).TRACKING_SESSIONS).toMatchObject({ enabled: true, durationDays: 30 });
  });

  it("separately expires rejected intents and caps linked idempotency at terminal PII", async () => {
    const migration = use(createMigrationIntegrationPool());
    const oldBooking = await createBooking(migration, "COMPLETED", "2024-01-01T00:00:00Z");
    const activeBooking = await createBooking(migration, "SCHEDULED", null);
    const oldCommitted = await insertIntent(migration, "COMMITTED", oldBooking, "2025-01-01T00:00:00Z", "2025-02-01T00:00:00Z");
    const activeCommitted = await insertIntent(migration, "COMMITTED", activeBooking, "2025-01-01T00:00:00Z", "2025-02-01T00:00:00Z");
    const rejected = await insertIntent(migration, "REJECTED", null, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z");
    const policy = loadMetadataRetentionPolicy({
      REJECTED_INTENT_RETENTION_DAYS: "30",
      REJECTED_INTENT_RETENTION_APPROVED: "true",
    });

    await runMetadataRetention(migration, {
      executionId: randomUUID(), jobClass: "IDEMPOTENCY_LINKED_PII_CAP", now: new Date("2026-09-02T12:00:00Z"),
    }, policy);
    await runMetadataRetention(migration, {
      executionId: randomUUID(), jobClass: "REJECTED_CONFIRMATION_INTENTS", now: new Date("2026-09-02T12:00:00Z"),
    }, policy);

    const remaining = await migration.query<{ intent_id: string }>(
      "select intent_id from app.confirmation_intents where intent_id = any($1::uuid[])",
      [[oldCommitted, activeCommitted, rejected]],
    );
    expect(remaining.rows.map((row) => row.intent_id)).toEqual([activeCommitted]);
  });

  it("runs approved tracking and abuse cleanup but keeps newer metadata", async () => {
    const migration = use(createMigrationIntegrationPool());
    const bookingId = await createBooking(migration, "COMPLETED", "2025-01-01T00:00:00Z");
    const credentialId = randomUUID();
    await migration.query(`insert into app.tracking_credentials
      (credential_id, booking_id, credential_version, verifier_key_version, credential_verifier, state, terminal_expires_at, issued_at)
      values ($1, $2, 1, 1, $3, 'ACTIVE', '2025-01-08T00:00:00Z', '2024-12-01T00:00:00Z')`,
    [credentialId, bookingId, "a".repeat(64)]);
    await migration.query(`insert into app.tracking_issuances
      (booking_id, state, credential_id, attempted_at, activated_at)
      values ($1, 'ACTIVE_RAW_NONRECOVERABLE', $2, '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z')`, [bookingId, credentialId]);
    await migration.query(`insert into app.tracking_sessions
      (session_verifier, credential_id, credential_version, issued_at, expires_at)
      values ($1, $2, 1, '2025-01-01T00:00:00Z', '2025-01-01T00:10:00Z')`, ["b".repeat(64), credentialId]);
    const oldSignal = randomUUID();
    const newSignal = randomUUID();
    await migration.query("insert into app.abuse_signals values ($1, 'TRACKING_PROOF', $2), ($3, 'TRACKING_PROOF', $4)",
      [oldSignal, "2025-01-01T00:00:00Z", newSignal, "2026-08-20T00:00:00Z"]);
    const policy = loadMetadataRetentionPolicy({
      TRACKING_SESSION_RETENTION_DAYS: "30", TRACKING_SESSION_RETENTION_APPROVED: "true",
      TRACKING_VERIFIER_RETENTION_DAYS: "30", TRACKING_VERIFIER_RETENTION_APPROVED: "true",
      ABUSE_SIGNAL_RETENTION_DAYS: "30", ABUSE_SIGNAL_RETENTION_APPROVED: "true",
    });

    for (const jobClass of ["TRACKING_SESSIONS", "TRACKING_VERIFIERS", "ABUSE_SIGNALS"] as const) {
      await runMetadataRetention(migration, { executionId: randomUUID(), jobClass, now: new Date("2026-09-02T12:00:00Z") }, policy);
    }

    expect((await migration.query("select 1 from app.tracking_credentials where credential_id = $1", [credentialId])).rowCount).toBe(0);
    expect((await migration.query(
      "select signal_id from app.abuse_signals where signal_id = any($1::uuid[]) order by signal_id",
      [[oldSignal, newSignal]],
    )).rows).toEqual([{ signal_id: newSignal }]);
  });

  it("rolls back an interruption and replays an execution ID without repeating work", async () => {
    const migration = use(createMigrationIntegrationPool());
    const runtime = use(createConcurrentIntegrationPool());
    const rejected = await insertIntent(migration, "REJECTED", null, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z");
    const policy = loadMetadataRetentionPolicy({
      REJECTED_INTENT_RETENTION_DAYS: "30",
      REJECTED_INTENT_RETENTION_APPROVED: "true",
    });
    const command = { executionId: randomUUID(), jobClass: "REJECTED_CONFIRMATION_INTENTS" as const, now: new Date("2026-09-02T12:00:00Z") };

    await expect(withTransaction(migration, async (client) => {
      await runMetadataRetentionInTransaction(client, command, policy);
      throw new Error("synthetic interruption");
    })).rejects.toThrow("synthetic interruption");
    expect((await migration.query("select 1 from app.confirmation_intents where intent_id = $1", [rejected])).rowCount).toBe(1);
    const first = await runMetadataRetention(migration, command, policy);
    expect(await runMetadataRetention(migration, command, policy)).toEqual(first);
    await expect(runtime.query("select * from app.metadata_retention_executions")).rejects.toThrow();
    await expect(runtime.query("delete from app.abuse_signals")).rejects.toThrow();
  });

  function use<T extends Pool>(pool: T): T { pools.push(pool); return pool; }
});

async function createBooking(pool: Pool, status: "SCHEDULED" | "COMPLETED", terminalAt: string | null) {
  const packageId = randomUUID();
  const bookingId = randomUUID();
  await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
  await pool.query("insert into app.service_package_revisions values ($1, 1, 'Metadata', null, 5000, 30, 'ACTIVE')", [packageId]);
  await pool.query(`insert into app.bookings
    (booking_id, status, terminal_transition_at, service_start, service_end, package_id, package_revision, service_mode, intended_payment_method)
    values ($1, $2, $3, '2026-10-01T12:00:00Z', '2026-10-01T12:30:00Z', $4, 1, 'DROP_OFF', 'PIX')`,
  [bookingId, status, terminalAt, packageId]);
  return bookingId;
}

async function insertIntent(pool: Pool, state: "COMMITTED" | "REJECTED", bookingId: string | null, completedAt: string, expiresAt: string) {
  const intentId = randomUUID();
  const outcomeCode = state === "COMMITTED" ? "BOOKING_CONFIRMED" : "BOOKING_REQUEST_INVALID";
  const projection = state === "COMMITTED" ? { bookingId, status: "SCHEDULED" } : { code: outcomeCode };
  await pool.query(`insert into app.confirmation_intents
    (intent_id, operation_scope, intent_key, request_fingerprint, state, booking_id, outcome_code,
     outcome_projection, lifecycle_class, created_at, completed_at, expires_at)
    values ($1, 'public.booking.confirm', $2, $3, $4, $5, $6, $7, $8, $9, $9, $10)`, [
    intentId, randomUUID().replaceAll("-", ""), "c".repeat(64), state, bookingId, outcomeCode,
    JSON.stringify(projection), state === "COMMITTED" ? "BOOKING_TERMINAL_PII_BOUND" : "REJECTED_BOUNDED",
    completedAt, expiresAt,
  ]);
  return intentId;
}
