import { createHash, randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";
import type { QueryResultRow } from "pg";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import {
  authorizeSensitiveDisclosure,
  discloseSensitiveField,
  readAuthorizedSensitiveFieldInTransaction,
} from "../../src/server/capabilities/admin-operations/sensitive-disclosure";
import { persistBookingPii } from "../../src/server/capabilities/booking-lifecycle/pii-repository";
import { createScheduledBooking } from "../../src/server/capabilities/booking-lifecycle/repository";
import { createConcurrentIntegrationPool, createMigrationIntegrationPool } from "../support/postgres";

describe("PostgreSQL sensitive disclosure boundary", () => {
  const pools: ReturnType<typeof createConcurrentIntegrationPool>[] = [];
  afterEach(async () => { await Promise.all(pools.splice(0).map((pool) => pool.end())); });

  it("requires the full audit-first pipeline and exposes only the requested eligible field", async () => {
    const pool = createConcurrentIntegrationPool(); pools.push(pool);
    const bookingId = await createPickupBooking(pool);
    const owner = await createActor(pool, "OWNER");
    const employee = await createActor(pool, "EMPLOYEE");

    await expect(pool.query(
      "select * from app.read_authorized_sensitive_field($1, $2, 'CPF', $3, $4, 'BOOKING_OPERATION')",
      [createHash("sha256").update(owner.session.cookieValue).digest("hex"), bookingId, randomUUID(), randomUUID()],
    )).resolves.toMatchObject({ rows: [] });

    const ownerCommand = command(bookingId, "CPF");
    await expect(discloseSensitiveField(pool, owner.session.cookieValue, ownerCommand))
      .resolves.toEqual({ field: "CPF", value: "12345678901" });
    await expect(discloseSensitiveField(pool, owner.session.cookieValue, ownerCommand))
      .resolves.toEqual({ field: "CPF", value: "12345678901" });
    await expect(discloseSensitiveField(pool, employee.session.cookieValue, command(bookingId, "PICKUP_ADDRESS")))
      .resolves.toEqual({ field: "PICKUP_ADDRESS", value: "Rua das Flores, 10" });
    await expect(discloseSensitiveField(pool, employee.session.cookieValue, command(bookingId, "CPF")))
      .rejects.toThrow("Sensitive field is not accessible");

    const events = await migrationQuery<{ actor_ref: string; target_ref: string; field_ref: string; action: string; outcome: string; reason_code: string }>(
      "select actor_ref, target_ref, field_ref, action, outcome, reason_code from app.audit_events where action = 'AUTHORIZED_FOR_DISCLOSURE' and target_ref = $1 order by field_ref",
      [bookingId],
    );
    expect(events).toEqual([
      { actor_ref: owner.adminId, target_ref: bookingId, field_ref: "CPF", action: "AUTHORIZED_FOR_DISCLOSURE", outcome: "SUCCEEDED", reason_code: "BOOKING_OPERATION" },
      { actor_ref: employee.adminId, target_ref: bookingId, field_ref: "PICKUP_ADDRESS", action: "AUTHORIZED_FOR_DISCLOSURE", outcome: "SUCCEEDED", reason_code: "BOOKING_OPERATION" },
    ]);
    expect(JSON.stringify(events)).not.toContain("12345678901");
    expect(JSON.stringify(events)).not.toContain("Rua das Flores");

    await expect(pool.query("select cpf from app.booking_customer_vehicle_pii where booking_id = $1", [bookingId])).rejects.toThrow();
    await expect(pool.query("select pickup_address from app.booking_customer_vehicle_pii where booking_id = $1", [bookingId])).rejects.toThrow();
    await expect(pool.query("select full_name from app.booking_customer_vehicle_pii where booking_id = $1", [bookingId]))
      .resolves.toMatchObject({ rows: [{ full_name: "Ana" }] });
  });

  it("denies stale authorization after audit when session, account, or field permission is reduced", async () => {
    const pool = createConcurrentIntegrationPool(); pools.push(pool);
    const bookingId = await createPickupBooking(pool);

    const revoked = await createActor(pool, "OWNER");
    const revokedAcceptance = await authorizeSensitiveDisclosure(pool, revoked.session.cookieValue, command(bookingId, "CPF"));
    await pool.query("update app.admin_sessions set revoked_at = current_timestamp where session_id = $1", [revokedAcceptance.sessionId]);
    await expect(discloseAccepted(pool, revoked.session.cookieValue, revokedAcceptance)).rejects.toThrow("Sensitive field is not accessible");

    const disabled = await createActor(pool, "OWNER");
    const disabledAcceptance = await authorizeSensitiveDisclosure(pool, disabled.session.cookieValue, command(bookingId, "CPF"));
    await pool.query("update app.admin_identities set account_state = 'DISABLED', authorization_version = authorization_version + 1 where admin_id = $1", [disabled.adminId]);
    await expect(discloseAccepted(pool, disabled.session.cookieValue, disabledAcceptance)).rejects.toThrow("Sensitive field is not accessible");

    const reduced = await createActor(pool, "OWNER");
    const reducedAcceptance = await authorizeSensitiveDisclosure(pool, reduced.session.cookieValue, command(bookingId, "CPF"));
    await pool.query("update app.admin_identities set role = 'EMPLOYEE', authorization_version = authorization_version + 1 where admin_id = $1", [reduced.adminId]);
    await expect(discloseAccepted(pool, reduced.session.cookieValue, reducedAcceptance)).rejects.toThrow("Sensitive field is not accessible");

    const expiredMfa = await createActor(pool, "OWNER");
    const expiredMfaAcceptance = await authorizeSensitiveDisclosure(pool, expiredMfa.session.cookieValue, command(bookingId, "CPF"));
    await pool.query("update app.admin_sessions set assurance_expires_at = current_timestamp where session_id = $1", [expiredMfaAcceptance.sessionId]);
    await expect(discloseAccepted(pool, expiredMfa.session.cookieValue, expiredMfaAcceptance)).rejects.toThrow("Sensitive field is not accessible");
  });

  it("fails closed before sensitive access when durable audit insertion is unavailable", async () => {
    const pool = createConcurrentIntegrationPool(); pools.push(pool);
    const migrationPool = createMigrationIntegrationPool();
    const bookingId = await createPickupBooking(pool);
    const owner = await createActor(pool, "OWNER");

    await migrationPool.query("revoke insert on app.audit_events from lava_test");
    try {
      await expect(discloseSensitiveField(pool, owner.session.cookieValue, command(bookingId, "CPF")))
        .rejects.toThrow("Sensitive disclosure audit is unavailable");
    } finally {
      await migrationPool.query("grant insert on app.audit_events to lava_test");
      await migrationPool.end();
    }
  });

  it("linearizes the final read so a concurrent privilege reduction waits rather than creating a stale disclosure", async () => {
    const pool = createConcurrentIntegrationPool(); pools.push(pool);
    const bookingId = await createPickupBooking(pool);
    const owner = await createActor(pool, "OWNER");
    const acceptance = await authorizeSensitiveDisclosure(pool, owner.session.cookieValue, command(bookingId, "CPF"));
    const reader = await pool.connect();

    try {
      await reader.query("begin");
      await expect(readAuthorizedSensitiveFieldInTransaction(reader, owner.session.cookieValue, acceptance))
        .resolves.toEqual({ field: "CPF", value: "12345678901" });

      const reduction = pool.query("update app.admin_identities set role = 'EMPLOYEE', authorization_version = authorization_version + 1 where admin_id = $1", [owner.adminId]);
      await expect(Promise.race([
        reduction.then(() => "REDUCED"),
        new Promise<string>((resolve) => setTimeout(() => resolve("WAITING"), 100)),
      ])).resolves.toBe("WAITING");

      await reader.query("commit");
      await expect(reduction).resolves.toMatchObject({ rowCount: 1 });
    } finally {
      await reader.query("rollback").catch(() => undefined);
      reader.release();
    }

    await expect(discloseSensitiveField(pool, owner.session.cookieValue, command(bookingId, "CPF")))
      .rejects.toThrow("Sensitive field is not accessible");
  });
});

function command(bookingId: string, field: "CPF" | "PICKUP_ADDRESS") {
  return {
    bookingId,
    field,
    purpose: "BOOKING_OPERATION" as const,
    reason: "Atendimento operacional solicitado pelo cliente.",
    correlationId: randomUUID(),
    requestId: randomUUID(),
  };
}

async function discloseAccepted(
  pool: ReturnType<typeof createConcurrentIntegrationPool>,
  sessionCookie: string,
  acceptance: Awaited<ReturnType<typeof authorizeSensitiveDisclosure>>,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const value = await readAuthorizedSensitiveFieldInTransaction(client, sessionCookie, acceptance);
    await client.query("commit");
    if (!value) throw new Error("Sensitive field is not accessible");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function createActor(pool: ReturnType<typeof createConcurrentIntegrationPool>, role: "OWNER" | "EMPLOYEE") {
  const adminId = randomUUID();
  const issuer = `https://${randomUUID()}.example.test`;
  await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, $3, $4)", [adminId, issuer, adminId, role]);
  return { adminId, session: await createLocalSession(pool, { issuer, subject: adminId, mfaAssured: true }) };
}

async function createPickupBooking(pool: ReturnType<typeof createConcurrentIntegrationPool>) {
  const packageId = randomUUID();
  await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
  await pool.query("insert into app.service_package_revisions values ($1, 1, 'Completo', 'Lavagem', 12500, 60, 'ACTIVE')", [packageId]);
  const booking = await createScheduledBooking(pool, { packageId, serviceStart: new Date("2026-09-01T12:00:00Z"), serviceMode: "PICKUP_REQUESTED", intendedPaymentMethod: "PIX" });
  await persistBookingPii(pool, { bookingId: booking.bookingId, fullName: "Ana", phoneWhatsapp: "5585999999999", email: undefined, cpf: "12345678901", vehicleModel: "Hatch", licencePlate: "ABC1D23", vehicleColor: "Prata", pickupAddress: "Rua das Flores, 10" });
  return booking.bookingId;
}

async function migrationQuery<Row extends QueryResultRow>(text: string, values: unknown[]): Promise<Row[]> {
  const { Pool } = await import("pg");
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required for audit verification.");
  const pool = new Pool({ connectionString, max: 1 });
  try { return (await pool.query<Row>(text, values)).rows; } finally { await pool.end(); }
}
