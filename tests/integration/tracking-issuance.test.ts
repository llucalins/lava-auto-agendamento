import { createHmac, randomBytes, randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { issueInitialTrackingCredential } from "../../src/server/capabilities/public-status-tracking/issuance";
import { createConcurrentIntegrationPool, createMigrationIntegrationPool } from "../support/postgres";

const verifierKey = randomBytes(32);

describe("show-once tracking issuance", () => {
  const pools: Pool[] = [];

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
  });

  it("returns a high-entropy raw credential once and persists only its keyed verifier", async () => {
    const pool = use(createConcurrentIntegrationPool());
    const observer = use(createMigrationIntegrationPool());
    const bookingId = await createBooking(pool);

    const issued = await issueInitialTrackingCredential(pool, bookingId, { keyVersion: 1, verifierKey });
    expect(issued.kind).toBe("ISSUED");
    if (issued.kind !== "ISSUED") throw new Error("Expected initial issuance");
    expect(Buffer.from(issued.credential, "base64url")).toHaveLength(32);

    const stored = await observer.query<{
      credential_verifier: string;
      issuance_state: string;
    }>(
      `select c.credential_verifier, i.state as issuance_state
       from app.tracking_issuances i
       join app.tracking_credentials c using (credential_id)
       where i.booking_id = $1`,
      [bookingId],
    );
    expect(stored.rows).toEqual([{
      credential_verifier: createHmac("sha256", verifierKey).update(issued.credential).digest("hex"),
      issuance_state: "ACTIVE_RAW_NONRECOVERABLE",
    }]);
    expect(JSON.stringify(stored.rows)).not.toContain(issued.credential);

    const lostResponseRetry = await issueInitialTrackingCredential(pool, bookingId, { keyVersion: 1, verifierKey });
    expect(lostResponseRetry).toEqual({ kind: "RAW_NONRECOVERABLE" });
    await expect(observer.query(
      "select count(*)::integer as count from app.tracking_credentials where booking_id = $1",
      [bookingId],
    )).resolves.toMatchObject({ rows: [{ count: 1 }] });
  });

  it("serializes concurrent issuance so only one caller can receive the raw value", async () => {
    const pool = use(createConcurrentIntegrationPool());
    const bookingId = await createBooking(pool);

    const outcomes = await Promise.all([
      issueInitialTrackingCredential(pool, bookingId, { keyVersion: 1, verifierKey }),
      issueInitialTrackingCredential(pool, bookingId, { keyVersion: 1, verifierKey }),
    ]);

    expect(outcomes.filter((outcome) => outcome.kind === "ISSUED")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "RAW_NONRECOVERABLE")).toHaveLength(1);
  });

  it("allows retry after a pre-commit crash but never after the marker commits", async () => {
    const pool = use(createConcurrentIntegrationPool());
    const observer = use(createMigrationIntegrationPool());
    const bookingId = await createBooking(pool);
    const crashClient = await observer.connect();
    try {
      await crashClient.query("begin");
      await crashClient.query(
        "select * from app.issue_initial_tracking_credential($1, $2, $3, $4)",
        [randomUUID(), bookingId, 1, randomBytes(32).toString("hex")],
      );
      await crashClient.query("rollback");
    } finally {
      crashClient.release();
    }

    await expect(issueInitialTrackingCredential(pool, bookingId, { keyVersion: 1, verifierKey }))
      .resolves.toMatchObject({ kind: "ISSUED" });
    await expect(issueInitialTrackingCredential(pool, bookingId, { keyVersion: 1, verifierKey }))
      .resolves.toEqual({ kind: "RAW_NONRECOVERABLE" });
  });

  it("cannot issue for a nonexistent or failed booking result", async () => {
    const pool = use(createConcurrentIntegrationPool());
    await expect(issueInitialTrackingCredential(pool, randomUUID(), { keyVersion: 1, verifierKey }))
      .rejects.toThrow("Tracking issuance unavailable");
  });

  function use<T extends Pool>(pool: T): T {
    pools.push(pool);
    return pool;
  }
});

async function createBooking(pool: Pool): Promise<string> {
  const packageId = randomUUID();
  const bookingId = randomUUID();
  const start = new Date(2_900_000_000_000 + (Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000) * 3_600_000);
  await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
  await pool.query("insert into app.service_package_revisions values ($1, 1, 'Issuance', null, 5000, 30, 'ACTIVE')", [packageId]);
  await pool.query(
    "insert into app.bookings (booking_id, status, service_start, service_end, package_id, package_revision, service_mode, intended_payment_method) values ($1, 'SCHEDULED', $2, $3, $4, 1, 'DROP_OFF', 'PIX')",
    [bookingId, start, new Date(start.getTime() + 30 * 60_000), packageId],
  );
  return bookingId;
}
