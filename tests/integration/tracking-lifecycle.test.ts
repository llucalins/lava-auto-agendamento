import { randomBytes, randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import {
  activateTrackingCredential,
  isTrackingCredentialVersionCurrent,
  replaceTrackingCredential,
  revokeTrackingCredential,
} from "../../src/server/capabilities/public-status-tracking/verifier";
import { createConcurrentIntegrationPool, createMigrationIntegrationPool } from "../support/postgres";

describe("PostgreSQL tracking credential lifecycle", () => {
  const pools: Pool[] = [];

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
  });

  it("persists verifier-only state and allows only one concurrent active credential", async () => {
    const pool = use(createConcurrentIntegrationPool());
    const observer = use(createMigrationIntegrationPool());
    const bookingId = await createBooking(pool, "SCHEDULED");
    const first = credential(bookingId);
    const second = credential(bookingId);

    const outcomes = await Promise.allSettled([
      activateTrackingCredential(pool, first),
      activateTrackingCredential(pool, second),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const stored = await observer.query(
      "select credential_id, credential_version, verifier_key_version, credential_verifier, state from app.tracking_credentials where booking_id = $1",
      [bookingId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({ credential_version: 1, verifier_key_version: 1, state: "ACTIVE" });
    expect(stored.rows[0].credential_verifier).toMatch(/^[a-f0-9]{64}$/);
    await expect(pool.query(
      "select credential_verifier from app.tracking_credentials where booking_id = $1",
      [bookingId],
    )).rejects.toThrow();

    const columns = await observer.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'app' and table_name = 'tracking_credentials'",
    );
    expect(columns.rows.map((row) => row.column_name)).not.toEqual(
      expect.arrayContaining(["raw_credential", "credential", "token", "secret"]),
    );
  });

  it("atomically replaces or revokes an active version and invalidates bound sessions", async () => {
    const pool = use(createConcurrentIntegrationPool());
    const observer = use(createMigrationIntegrationPool());
    const bookingId = await createBooking(pool, "SCHEDULED");
    const initial = credential(bookingId);
    const active = await activateTrackingCredential(pool, initial);
    const sessionVerifier = verifier();
    await observer.query(
      "insert into app.tracking_sessions (session_verifier, credential_id, credential_version, expires_at) values ($1, $2, $3, current_timestamp + interval '15 minutes')",
      [sessionVerifier, active.credentialId, active.credentialVersion],
    );

    const replacements = await Promise.allSettled([
      replaceTrackingCredential(pool, {
        ...credential(bookingId),
        expectedVersion: active.credentialVersion,
      }),
      replaceTrackingCredential(pool, {
        ...credential(bookingId),
        expectedVersion: active.credentialVersion,
      }),
    ]);
    expect(replacements.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(await isTrackingCredentialVersionCurrent(pool, active)).toBe(false);
    await expect(observer.query(
      "select revoked_at is not null as revoked from app.tracking_sessions where session_verifier = $1",
      [sessionVerifier],
    )).resolves.toMatchObject({ rows: [{ revoked: true }] });

    const replacement = replacements.find((outcome) => outcome.status === "fulfilled");
    if (!replacement || replacement.status !== "fulfilled") throw new Error("Expected a replacement");
    expect(replacement.value.credentialVersion).toBe(2);
    expect(await isTrackingCredentialVersionCurrent(pool, replacement.value)).toBe(true);
    await revokeTrackingCredential(pool, {
      bookingId,
      expectedVersion: replacement.value.credentialVersion,
    });
    expect(await isTrackingCredentialVersionCurrent(pool, replacement.value)).toBe(false);
  });

  it.each(["COMPLETED", "CANCELLED"] as const)(
    "couples %s to an immutable terminal timestamp and exact seven-day credential expiry",
    async (terminalStatus) => {
      const pool = use(createConcurrentIntegrationPool());
      const observer = use(createMigrationIntegrationPool());
      const initialStatus = terminalStatus === "COMPLETED" ? "IN_PROGRESS" : "SCHEDULED";
      const bookingId = await createBooking(pool, initialStatus);
      const active = await activateTrackingCredential(pool, credential(bookingId));

      await pool.query("update app.bookings set status = $2, revision = revision + 1 where booking_id = $1", [bookingId, terminalStatus]);
      const terminal = await observer.query<{
        terminal_transition_at: Date;
        terminal_expires_at: Date;
      }>(
        "select b.terminal_transition_at, c.terminal_expires_at from app.bookings b join app.tracking_credentials c using (booking_id) where b.booking_id = $1",
        [bookingId],
      );
      const row = terminal.rows[0]!;
      expect(row.terminal_expires_at.getTime() - row.terminal_transition_at.getTime()).toBe(7 * 24 * 60 * 60 * 1_000);
      expect(await isTrackingCredentialVersionCurrent(pool, active)).toBe(true);

      await pool.query("update app.bookings set revision = revision + 1 where booking_id = $1", [bookingId]);
      await expect(observer.query(
        "select terminal_transition_at from app.bookings where booking_id = $1",
        [bookingId],
      )).resolves.toMatchObject({ rows: [{ terminal_transition_at: row.terminal_transition_at }] });
    },
  );

  function use<T extends Pool>(pool: T): T {
    pools.push(pool);
    return pool;
  }
});

function credential(bookingId: string) {
  return {
    bookingId,
    credentialId: randomUUID(),
    verifierKeyVersion: 1,
    credentialVerifier: verifier(),
  };
}

function verifier(): string {
  return randomBytes(32).toString("hex");
}

async function createBooking(pool: Pool, status: "SCHEDULED" | "IN_PROGRESS"): Promise<string> {
  const packageId = randomUUID();
  const bookingId = randomUUID();
  const start = new Date(2_800_000_000_000 + (Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000) * 3_600_000);
  const end = new Date(start.getTime() + 30 * 60_000);
  await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
  await pool.query("insert into app.service_package_revisions values ($1, 1, 'Tracking', null, 5000, 30, 'ACTIVE')", [packageId]);
  await pool.query(
    "insert into app.bookings (booking_id, revision, status, service_start, service_end, package_id, package_revision, service_mode, intended_payment_method) values ($1, 1, $2, $3, $4, $5, 1, 'DROP_OFF', 'PIX')",
    [bookingId, status, start, end, packageId],
  );
  return bookingId;
}
