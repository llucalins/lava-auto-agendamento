import { createHmac, randomBytes, randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { issueInitialTrackingCredential } from "../../src/server/capabilities/public-status-tracking/issuance";
import { proveTrackingCredential, resolveTrackingSession } from "../../src/server/capabilities/public-status-tracking/proof";
import { replaceTrackingCredential, revokeTrackingCredential } from "../../src/server/capabilities/public-status-tracking/verifier";
import { createConcurrentIntegrationPool, createMigrationIntegrationPool } from "../support/postgres";

const key = { keyVersion: 1, verifierKey: randomBytes(32) };

describe("PostgreSQL tracking proof-to-session", () => {
  const pools: Pool[] = [];

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
  });

  it("stores only an opaque session verifier bound to the current credential version", async () => {
    const pool = use(createConcurrentIntegrationPool());
    const observer = use(createMigrationIntegrationPool());
    const bookingId = await createBooking(pool);
    const issued = await issueInitialTrackingCredential(pool, bookingId, key);
    if (issued.kind !== "ISSUED") throw new Error("Expected issuance");

    const proof = await proveTrackingCredential(pool, issued.credential, key);
    expect(proof).not.toBeNull();
    if (!proof) throw new Error("Expected proof");
    expect(Buffer.from(proof.cookieValue, "base64url")).toHaveLength(32);
    const binding = await resolveTrackingSession(pool, proof.cookieValue);
    expect(binding).toMatchObject({ bookingId, credentialVersion: 1 });

    const stored = await observer.query<{ session_verifier: string }>(
      "select session_verifier from app.tracking_sessions where credential_id = $1",
      [binding?.credentialId],
    );
    expect(stored.rows[0]?.session_verifier).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.rows[0]?.session_verifier).not.toBe(proof.cookieValue);
    expect(JSON.stringify(stored.rows)).not.toContain(issued.credential);
    await expect(pool.query("select session_verifier from app.tracking_sessions")).rejects.toThrow();
  });

  it("immediately denies an established session after replacement or revocation", async () => {
    const pool = use(createConcurrentIntegrationPool());
    const observer = use(createMigrationIntegrationPool());
    const bookingId = await createBooking(pool);
    const issued = await issueInitialTrackingCredential(pool, bookingId, key);
    if (issued.kind !== "ISSUED") throw new Error("Expected issuance");
    const proof = await proveTrackingCredential(pool, issued.credential, key);
    if (!proof) throw new Error("Expected proof");
    const current = await resolveTrackingSession(pool, proof.cookieValue);
    if (!current) throw new Error("Expected session");

    const replacementRaw = randomBytes(32).toString("base64url");
    const replacement = await replaceTrackingCredential(pool, {
      bookingId,
      expectedVersion: current.credentialVersion,
      credentialId: randomUUID(),
      verifierKeyVersion: key.keyVersion,
      credentialVerifier: createHmac("sha256", key.verifierKey).update(replacementRaw).digest("hex"),
    });
    expect(await resolveTrackingSession(pool, proof.cookieValue)).toBeNull();

    const replacementProof = await proveTrackingCredential(pool, replacementRaw, key);
    expect(replacementProof).not.toBeNull();
    await revokeTrackingCredential(pool, { bookingId, expectedVersion: replacement.credentialVersion });
    expect(await resolveTrackingSession(pool, replacementProof!.cookieValue)).toBeNull();
    await expect(observer.query(
      "select count(*)::integer as count from app.tracking_sessions where revoked_at is null and credential_id in ($1, $2)",
      [current.credentialId, replacement.credentialId],
    )).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it("collapses malformed, nonexistent, revoked, replaced, and expired proofs to the same null result", async () => {
    const pool = use(createConcurrentIntegrationPool());
    const observer = use(createMigrationIntegrationPool());
    const bookingId = await createBooking(pool);
    const issued = await issueInitialTrackingCredential(pool, bookingId, key);
    if (issued.kind !== "ISSUED") throw new Error("Expected issuance");
    const active = await observer.query<{ credential_id: string; credential_version: number }>(
      "select credential_id, credential_version from app.tracking_credentials where booking_id = $1 and state = 'ACTIVE'",
      [bookingId],
    );

    expect(await proveTrackingCredential(pool, "malformed", key)).toBeNull();
    expect(await proveTrackingCredential(pool, randomBytes(32).toString("base64url"), key)).toBeNull();
    await revokeTrackingCredential(pool, { bookingId, expectedVersion: active.rows[0]!.credential_version });
    expect(await proveTrackingCredential(pool, issued.credential, key)).toBeNull();

    const expired = await createExpiredCredential(observer);
    expect(await proveTrackingCredential(pool, expired, key)).toBeNull();
  });

  function use<T extends Pool>(pool: T): T {
    pools.push(pool);
    return pool;
  }
});

async function createBooking(pool: Pool): Promise<string> {
  const packageId = randomUUID();
  const bookingId = randomUUID();
  const start = new Date(3_000_000_000_000 + (Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000) * 3_600_000);
  await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
  await pool.query("insert into app.service_package_revisions values ($1, 1, 'Proof', null, 5000, 30, 'ACTIVE')", [packageId]);
  await pool.query(
    "insert into app.bookings (booking_id, status, service_start, service_end, package_id, package_revision, service_mode, intended_payment_method) values ($1, 'SCHEDULED', $2, $3, $4, 1, 'DROP_OFF', 'PIX')",
    [bookingId, start, new Date(start.getTime() + 30 * 60_000), packageId],
  );
  return bookingId;
}

async function createExpiredCredential(observer: Pool): Promise<string> {
  const packageId = randomUUID();
  const bookingId = randomUUID();
  const credentialId = randomUUID();
  const raw = randomBytes(32).toString("base64url");
  const start = new Date(3_100_000_000_000);
  await observer.query("insert into app.service_packages values ($1, 1)", [packageId]);
  await observer.query("insert into app.service_package_revisions values ($1, 1, 'Expired proof', null, 5000, 30, 'ACTIVE')", [packageId]);
  await observer.query(
    `insert into app.bookings (booking_id, status, terminal_transition_at, service_start, service_end, package_id, package_revision, service_mode, intended_payment_method)
     values ($1, 'COMPLETED', current_timestamp - interval '8 days', $2, $3, $4, 1, 'DROP_OFF', 'PIX')`,
    [bookingId, start, new Date(start.getTime() + 30 * 60_000), packageId],
  );
  await observer.query(
    `insert into app.tracking_credentials (
       credential_id, booking_id, credential_version, verifier_key_version, credential_verifier,
       state, issued_at, terminal_expires_at
     ) values ($1, $2, 1, $3, $4, 'ACTIVE', current_timestamp - interval '9 days', current_timestamp - interval '1 day')`,
    [credentialId, bookingId, key.keyVersion, createHmac("sha256", key.verifierKey).update(raw).digest("hex")],
  );
  return raw;
}
