import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { issueInitialTrackingCredential } from "../../src/server/capabilities/public-status-tracking/issuance";
import { proveTrackingCredential } from "../../src/server/capabilities/public-status-tracking/proof";
import { readTrackingStatus } from "../../src/server/capabilities/public-status-tracking/status";
import { replaceTrackingCredential, revokeTrackingCredential } from "../../src/server/capabilities/public-status-tracking/verifier";
import { createConcurrentIntegrationPool, createMigrationIntegrationPool } from "../support/postgres";

const key = { keyVersion: 1, verifierKey: randomBytes(32) };

describe("PostgreSQL tracking status-only projection", () => {
  const pools: Pool[] = [];

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
  });

  it("returns exactly the current booking status for a current tracking session", async () => {
    const pool = use(createConcurrentIntegrationPool());
    const bookingId = await createBooking(pool);
    const issued = await issueInitialTrackingCredential(pool, bookingId, key);
    if (issued.kind !== "ISSUED") throw new Error("Expected issuance");
    const proof = await proveTrackingCredential(pool, issued.credential, key);
    if (!proof) throw new Error("Expected proof");

    const projection = await readTrackingStatus(pool, proof.cookieValue);

    expect(projection).toEqual({ status: "SCHEDULED" });
    expect(Object.keys(projection ?? {})).toEqual(["status"]);
  });

  it("immediately denies status after replacement, revocation, or session expiry", async () => {
    const pool = use(createConcurrentIntegrationPool());
    const observer = use(createMigrationIntegrationPool());
    const bookingId = await createBooking(pool);
    const issued = await issueInitialTrackingCredential(pool, bookingId, key);
    if (issued.kind !== "ISSUED") throw new Error("Expected issuance");
    const firstProof = await proveTrackingCredential(pool, issued.credential, key);
    if (!firstProof) throw new Error("Expected proof");
    const current = await observer.query<{ credential_id: string; credential_version: number }>(
      "select credential_id, credential_version from app.tracking_credentials where booking_id = $1 and state = 'ACTIVE'",
      [bookingId],
    );
    const replacementRaw = randomBytes(32).toString("base64url");
    const replacement = await replaceTrackingCredential(pool, {
      bookingId,
      expectedVersion: current.rows[0]!.credential_version,
      credentialId: randomUUID(),
      verifierKeyVersion: key.keyVersion,
      credentialVerifier: createHmac("sha256", key.verifierKey).update(replacementRaw).digest("hex"),
    });
    expect(await readTrackingStatus(pool, firstProof.cookieValue)).toBeNull();

    const secondProof = await proveTrackingCredential(pool, replacementRaw, key);
    if (!secondProof) throw new Error("Expected replacement proof");
    await revokeTrackingCredential(pool, { bookingId, expectedVersion: replacement.credentialVersion });
    expect(await readTrackingStatus(pool, secondProof.cookieValue)).toBeNull();

    const otherBookingId = await createBooking(pool);
    const otherIssued = await issueInitialTrackingCredential(pool, otherBookingId, key);
    if (otherIssued.kind !== "ISSUED") throw new Error("Expected issuance");
    const expiringProof = await proveTrackingCredential(pool, otherIssued.credential, key);
    if (!expiringProof) throw new Error("Expected proof");
    await observer.query(
      "update app.tracking_sessions set issued_at = current_timestamp - interval '2 minutes', expires_at = current_timestamp - interval '1 second' where session_verifier = $1",
      [digest(expiringProof.cookieValue)],
    );
    expect(await readTrackingStatus(pool, expiringProof.cookieValue)).toBeNull();
  });

  function use<T extends Pool>(pool: T): T {
    pools.push(pool);
    return pool;
  }
});

async function createBooking(pool: Pool): Promise<string> {
  const packageId = randomUUID();
  const bookingId = randomUUID();
  const start = new Date(3_200_000_000_000 + (Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000) * 3_600_000);
  await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
  await pool.query("insert into app.service_package_revisions values ($1, 1, 'Status', null, 5000, 30, 'ACTIVE')", [packageId]);
  await pool.query(
    "insert into app.bookings (booking_id, status, service_start, service_end, package_id, package_revision, service_mode, intended_payment_method) values ($1, 'SCHEDULED', $2, $3, $4, 1, 'DROP_OFF', 'PIX')",
    [bookingId, start, new Date(start.getTime() + 30 * 60_000), packageId],
  );
  return bookingId;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
