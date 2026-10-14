import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import {
  getAdminEstablishmentProfile,
  getPublicEstablishmentProfile,
  updateEstablishmentProfile,
} from "../../src/server/capabilities/admin-operations/establishment-profile";
import { createConcurrentIntegrationPool } from "../support/postgres";

describe("PostgreSQL establishment profile", () => {
  const pools: Pool[] = [];
  afterEach(async () => { await Promise.all(pools.splice(0).map((pool) => pool.end())); });

  it("allows an OWNER to publish the single profile and exposes only its public fields", async () => {
    const owner = await createActor("OWNER");
    const current = await getAdminEstablishmentProfile(owner.pool, owner.sessionCookie);
    const command = profileCommand(current.revision);

    const updated = await updateEstablishmentProfile(owner.pool, owner.sessionCookie, command);

    expect(updated).toMatchObject({
      revision: current.revision + 1,
      tradeName: command.tradeName,
      whatsapp: command.whatsapp,
      address: command.address,
    });
    await expect(getAdminEstablishmentProfile(owner.pool, owner.sessionCookie)).resolves.toEqual(updated);
    await expect(getPublicEstablishmentProfile(owner.pool)).resolves.toEqual({
      tradeName: command.tradeName,
      whatsapp: command.whatsapp,
      address: command.address,
    });
    await expect(owner.pool.query<{ profileCount: string }>(
      "select count(*)::text as \"profileCount\" from app.establishment_profile",
    )).resolves.toMatchObject({ rows: [{ profileCount: "1" }] });
    await expectAudit(owner.auditPool, owner.adminId);
  });

  it("rejects employees, invalid input, and stale profile revisions without extra audit", async () => {
    const owner = await createActor("OWNER");
    const employee = await createActor("EMPLOYEE");
    const current = await getAdminEstablishmentProfile(owner.pool, owner.sessionCookie);

    await expect(getAdminEstablishmentProfile(employee.pool, employee.sessionCookie)).rejects.toThrow("Forbidden");
    await expect(updateEstablishmentProfile(employee.pool, employee.sessionCookie, profileCommand(current.revision)))
      .rejects.toThrow("Forbidden");
    await expect(updateEstablishmentProfile(owner.pool, owner.sessionCookie, {
      ...profileCommand(current.revision),
      whatsapp: "not-a-phone-number",
    })).rejects.toThrow("Invalid establishment profile");

    const published = await updateEstablishmentProfile(owner.pool, owner.sessionCookie, profileCommand(current.revision));
    await expect(updateEstablishmentProfile(owner.pool, owner.sessionCookie, profileCommand(current.revision)))
      .rejects.toThrow("Stale establishment profile revision");

    await expect(getAdminEstablishmentProfile(owner.pool, owner.sessionCookie)).resolves.toMatchObject({
      revision: published.revision,
      tradeName: published.tradeName,
    });
    await expectAudit(owner.auditPool, owner.adminId, 1);
  });

  it("serializes concurrent owner edits using the expected profile revision", async () => {
    const owner = await createActor("OWNER");
    const current = await getAdminEstablishmentProfile(owner.pool, owner.sessionCookie);

    const outcomes = await Promise.allSettled([
      updateEstablishmentProfile(owner.pool, owner.sessionCookie, {
        ...profileCommand(current.revision),
        tradeName: `Synthetic A ${randomUUID().slice(0, 8)}`,
      }),
      updateEstablishmentProfile(owner.pool, owner.sessionCookie, {
        ...profileCommand(current.revision),
        tradeName: `Synthetic B ${randomUUID().slice(0, 8)}`,
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    await expect(getAdminEstablishmentProfile(owner.pool, owner.sessionCookie)).resolves.toMatchObject({
      revision: current.revision + 1,
    });
    await expectAudit(owner.auditPool, owner.adminId, 1);
  });

  async function createActor(role: "OWNER" | "EMPLOYEE") {
    const pool = createConcurrentIntegrationPool();
    const auditPool = createAuditObserverPool();
    pools.push(pool, auditPool);
    const adminId = randomUUID();
    const issuer = `https://${randomUUID()}.example.test`;
    await pool.query(
      "insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, $3, $4)",
      [adminId, issuer, adminId, role],
    );
    const session = await createLocalSession(pool, { issuer, subject: adminId, mfaAssured: true });
    return { pool, auditPool, adminId, sessionCookie: session.cookieValue };
  }
});

function profileCommand(expectedRevision: number) {
  const id = randomUUID().slice(0, 8);
  return {
    expectedRevision,
    tradeName: `Lava Auto Synthetic ${id}`,
    whatsapp: "+5585999990000",
    address: `Rua de Teste, ${id}, Fortaleza - CE`,
  };
}

function createAuditObserverPool(): Pool {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required for profile audit verification.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 1 });
}

async function expectAudit(pool: Pool, actorId: string, expectedCount = 1): Promise<void> {
  await expect(pool.query<{ actorRef: string; action: string }>(
    "select actor_ref as \"actorRef\", action from app.audit_events where target_ref = $1 and actor_ref = $2 and action = 'ESTABLISHMENT_PROFILE_UPDATED'",
    ["00000000-0000-4000-8000-000000000001", actorId],
  )).resolves.toMatchObject({ rowCount: expectedCount, rows: Array.from({ length: expectedCount }, () => ({ actorRef: actorId, action: "ESTABLISHMENT_PROFILE_UPDATED" })) });
}
