import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import {
  createAdminPackage,
  listAdminPackages,
  reviseAdminPackage,
  reviseAdminPackageInTransaction,
} from "../../src/server/capabilities/admin-operations/package-management";
import { listActivePackages } from "../../src/server/capabilities/service-catalog/public-query";
import { withTransaction } from "../../src/server/persistence/transaction";
import { createConcurrentIntegrationPool } from "../support/postgres";

describe("PostgreSQL admin package management", () => {
  const pools: Pool[] = [];
  afterEach(async () => { await Promise.all(pools.splice(0).map((pool) => pool.end())); });

  it("allows only an OWNER to create a validated package with durable minimized audit", async () => {
    const owner = await createActor("OWNER");
    const packageName = `000 Completo ${randomUUID().slice(0, 8)}`;
    const created = await createAdminPackage(owner.pool, owner.sessionCookie, {
      name: packageName,
      description: "Lavagem completa",
      priceCentavos: 0,
      durationMinutes: 60,
      state: "ACTIVE",
    });

    expect(created).toMatchObject({ revision: 1, state: "ACTIVE" });
    await expect(listAdminPackages(owner.pool, owner.sessionCookie)).resolves.toContainEqual({
      packageId: created.packageId,
      revision: 1,
      name: packageName,
      description: "Lavagem completa",
      priceCentavos: "0",
      currency: "BRL",
      durationMinutes: 60,
      state: "ACTIVE",
    });
    await expectAudit(owner.auditPool, created.packageId, owner.adminId, ["PACKAGE_CREATED"]);

    const employee = await createActor("EMPLOYEE");
    await expect(createAdminPackage(employee.pool, employee.sessionCookie, {
      name: "Negado",
      description: null,
      priceCentavos: 100,
      durationMinutes: 30,
      state: "ACTIVE",
    })).rejects.toThrow("Forbidden");
  });

  it("publishes immutable revisions, preserves booking snapshots, and rejects stale writes", async () => {
    const owner = await createActor("OWNER");
    const packageId = await insertPackage(owner.pool);
    const bookingId = await insertBookingSnapshot(owner.pool, packageId);

    const revised = await reviseAdminPackage(owner.pool, owner.sessionCookie, {
      packageId,
      expectedRevision: 1,
      name: "Completo novo",
      description: "Termos novos",
      priceCentavos: 12500,
      durationMinutes: 90,
      state: "INACTIVE",
    });

    expect(revised).toMatchObject({ packageId, revision: 2, state: "INACTIVE" });
    await expect(owner.pool.query(
      "select revision, name, price_centavos::text as price, duration_minutes, state from app.service_package_revisions where package_id = $1 order by revision",
      [packageId],
    )).resolves.toMatchObject({ rows: [
      { revision: 1, name: "Completo", price: "10000", duration_minutes: 60, state: "ACTIVE" },
      { revision: 2, name: "Completo novo", price: "12500", duration_minutes: 90, state: "INACTIVE" },
    ] });
    await expect(owner.pool.query(
      "select name, description, price_centavos::text as price, duration_minutes from app.booking_package_snapshots where booking_id = $1",
      [bookingId],
    )).resolves.toMatchObject({ rows: [{ name: "Completo", description: "Original", price: "10000", duration_minutes: 60 }] });
    await expect(listActivePackages(owner.pool)).resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ id: packageId })]));
    await expectAudit(owner.auditPool, packageId, owner.adminId, ["PACKAGE_REVISION_PUBLISHED"]);

    await expect(reviseAdminPackage(owner.pool, owner.sessionCookie, {
      packageId,
      expectedRevision: 1,
      name: "Stale",
      description: null,
      priceCentavos: 1,
      durationMinutes: 1,
      state: "ACTIVE",
    })).rejects.toThrow("Stale package revision");
    await expectAudit(owner.auditPool, packageId, owner.adminId, ["PACKAGE_REVISION_PUBLISHED"]);
  });

  it("serializes concurrent writers so only one expected revision commits", async () => {
    const owner = await createActor("OWNER");
    const packageId = await insertPackage(owner.pool);
    const command = {
      packageId,
      expectedRevision: 1,
      name: "Concorrente",
      description: null,
      priceCentavos: 11000,
      durationMinutes: 60,
      state: "ACTIVE" as const,
    };

    const outcomes = await Promise.allSettled([
      reviseAdminPackage(owner.pool, owner.sessionCookie, command),
      reviseAdminPackage(owner.pool, owner.sessionCookie, command),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    await expect(owner.pool.query("select current_revision from app.service_packages where package_id = $1", [packageId]))
      .resolves.toMatchObject({ rows: [{ current_revision: 2 }] });
    await expectAudit(owner.auditPool, packageId, owner.adminId, ["PACKAGE_REVISION_PUBLISHED"]);
  });

  it("rolls back a high-impact revision and its audit together", async () => {
    const owner = await createActor("OWNER");
    const packageId = await insertPackage(owner.pool);

    await expect(withTransaction(owner.pool, async (client) => {
      await reviseAdminPackageInTransaction(client, owner.sessionCookie, {
        packageId,
        expectedRevision: 1,
        name: "Rollback",
        description: null,
        priceCentavos: 12000,
        durationMinutes: 75,
        state: "INACTIVE",
      });
      throw new Error("forced rollback");
    })).rejects.toThrow("forced rollback");

    await expect(owner.pool.query("select current_revision from app.service_packages where package_id = $1", [packageId]))
      .resolves.toMatchObject({ rows: [{ current_revision: 1 }] });
    await expect(owner.pool.query("select revision from app.service_package_revisions where package_id = $1 order by revision", [packageId]))
      .resolves.toMatchObject({ rows: [{ revision: 1 }] });
    await expectAudit(owner.auditPool, packageId, owner.adminId, []);
  });

  async function createActor(role: "OWNER" | "EMPLOYEE") {
    const pool = createConcurrentIntegrationPool();
    const auditPool = createAuditObserverPool();
    pools.push(pool, auditPool);
    const adminId = randomUUID();
    const issuer = `https://${randomUUID()}.example.test`;
    await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, $3, $4)", [adminId, issuer, adminId, role]);
    const session = await createLocalSession(pool, { issuer, subject: adminId, mfaAssured: true });
    return { pool, auditPool, adminId, sessionCookie: session.cookieValue };
  }
});

function createAuditObserverPool(): Pool {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required for package audit verification.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 1 });
}

async function insertPackage(pool: Pool): Promise<string> {
  const packageId = randomUUID();
  await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
  await pool.query("insert into app.service_package_revisions values ($1, 1, 'Completo', 'Original', 10000, 60, 'ACTIVE')", [packageId]);
  return packageId;
}

async function insertBookingSnapshot(pool: Pool, packageId: string): Promise<string> {
  const bookingId = randomUUID();
  const start = new Date(2_600_000_000_000 + (Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000) * 3_600_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  await pool.query(
    "insert into app.bookings (booking_id, status, service_start, service_end, package_id, package_revision, service_mode, intended_payment_method) values ($1, 'SCHEDULED', $2, $3, $4, 1, 'DROP_OFF', 'PIX')",
    [bookingId, start, end, packageId],
  );
  await pool.query(
    "insert into app.booking_package_snapshots (booking_id, package_id, package_revision, name, description, price_centavos, currency, duration_minutes) values ($1, $2, 1, 'Completo', 'Original', 10000, 'BRL', 60)",
    [bookingId, packageId],
  );
  return bookingId;
}

async function expectAudit(auditPool: Pool, packageId: string, adminId: string, actions: string[]): Promise<void> {
  await expect(auditPool.query(
    "select actor_ref as \"actorRef\", action from app.audit_events where target_ref = $1 and action like 'PACKAGE_%' order by occurred_at, event_id",
    [packageId],
  )).resolves.toMatchObject({ rows: actions.map((action) => ({ actorRef: adminId, action })) });
}
