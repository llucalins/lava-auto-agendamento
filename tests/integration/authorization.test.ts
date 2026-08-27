import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { canChangeIdentity, canRevealField, changeAdminIdentity, changeAdminIdentityInTransaction, hasPermission, resolveAuthorizedSession } from "../../src/server/capabilities/admin-access/authorization";
import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import { withTransaction } from "../../src/server/persistence/transaction";
import { createIntegrationPool } from "../support/postgres";

const owner = { adminId: "owner", role: "OWNER", accountState: "ACTIVE", authorizationVersion: 1 } as const;
const employee = { adminId: "employee", role: "EMPLOYEE", accountState: "ACTIVE", authorizationVersion: 1 } as const;
describe("authorization matrix", () => {
  it("denies unknown roles and sensitive fields by default", () => { expect(hasPermission({ ...owner, role: "UNKNOWN" }, "BOOKING_READ")).toBe(false); expect(canRevealField(employee, "CPF")).toBe(false); expect(canRevealField(employee, "PICKUP_ADDRESS")).toBe(true); });
  it("prevents self escalation and last-owner removal", () => { expect(canChangeIdentity(owner, "owner", false, 2)).toBe(false); expect(canChangeIdentity(owner, "employee", true, 1)).toBe(false); expect(canChangeIdentity(owner, "employee", true, 2)).toBe(true); });
});

describe("PostgreSQL authorization", () => {
  const pools: ReturnType<typeof createIntegrationPool>[] = [];
  afterEach(async () => { await Promise.all(pools.splice(0).map((pool) => pool.end())); });

  it("denies IDOR attempts and invalidates a reduced identity's existing session", async () => {
    const pool = createIntegrationPool(); pools.push(pool);
    const issuer = `https://${randomUUID()}.example.test`;
    const ownerId = randomUUID(); const employeeId = randomUUID();
    await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1,$2,'owner','OWNER'),($3,$2,'employee','EMPLOYEE')", [ownerId, issuer, employeeId]);
    const employeeSession = await createLocalSession(pool, { issuer, subject: "employee", mfaAssured: true });
    await expect(resolveAuthorizedSession(pool, employeeSession.cookieValue, "PACKAGE_MANAGE")).resolves.toBeNull();
    const { auditEventId } = await changeAdminIdentity(pool, { actorAdminId: ownerId, targetAdminId: employeeId, role: "EMPLOYEE", accountState: "DISABLED" });
    await expect(resolveAuthorizedSession(pool, employeeSession.cookieValue, "BOOKING_READ")).resolves.toBeNull();
    await expect(pool.query("select i.authorization_version, s.revoked_at is not null as revoked from app.admin_identities i join app.admin_sessions s on s.issuer = i.issuer and s.subject = i.subject where i.admin_id = $1", [employeeId])).resolves.toMatchObject({ rows: [{ authorization_version: "2", revoked: true }] });
    await expect(pool.query("insert into app.audit_events (event_id, category, action, outcome, schema_version, actor_ref, target_ref) values ($1,'AUTHORIZATION','ADMIN_IDENTITY_CHANGED','SUCCEEDED',1,$2,$3)", [auditEventId, ownerId, employeeId])).rejects.toThrow();
    await expect(changeAdminIdentity(pool, { actorAdminId: employeeId, targetAdminId: ownerId, role: "EMPLOYEE", accountState: "ACTIVE" })).rejects.toThrow("Forbidden");
  });

  it("rolls back identity version and durable audit when the enclosing privilege transaction fails", async () => {
    const pool = createIntegrationPool(); pools.push(pool);
    const issuer = `https://${randomUUID()}.example.test`;
    const ownerId = randomUUID(); const employeeId = randomUUID(); let auditEventId = "";
    await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1,$2,'owner','OWNER'),($3,$2,'employee','EMPLOYEE')", [ownerId, issuer, employeeId]);
    await expect(withTransaction(pool, async (client) => {
      auditEventId = (await changeAdminIdentityInTransaction(client, { actorAdminId: ownerId, targetAdminId: employeeId, role: "OWNER", accountState: "ACTIVE" })).auditEventId;
      throw new Error("forced rollback");
    })).rejects.toThrow("forced rollback");
    await expect(pool.query("select role, authorization_version from app.admin_identities where admin_id = $1", [employeeId])).resolves.toMatchObject({ rows: [{ role: "EMPLOYEE", authorization_version: "1" }] });
    await expect(pool.query("insert into app.audit_events (event_id, category, action, outcome, schema_version, actor_ref, target_ref) values ($1,'AUTHORIZATION','ADMIN_IDENTITY_CHANGED','SUCCEEDED',1,$2,$3)", [auditEventId, ownerId, employeeId])).resolves.toBeDefined();
  });

  it("enforces owner and self-escalation guards from current PostgreSQL state", async () => {
    const pool = createIntegrationPool(); pools.push(pool);
    const issuer = `https://${randomUUID()}.example.test`;
    const ownerId = randomUUID(); const secondOwnerId = randomUUID(); const employeeId = randomUUID();
    await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1,$2,'owner','OWNER'),($3,$2,'second-owner','OWNER'),($4,$2,'employee','EMPLOYEE')", [ownerId, issuer, secondOwnerId, employeeId]);
    await expect(changeAdminIdentity(pool, { actorAdminId: employeeId, targetAdminId: employeeId, role: "OWNER", accountState: "ACTIVE" })).rejects.toThrow("Forbidden");
    await changeAdminIdentity(pool, { actorAdminId: ownerId, targetAdminId: secondOwnerId, role: "EMPLOYEE", accountState: "ACTIVE" });
    await expect(changeAdminIdentity(pool, { actorAdminId: ownerId, targetAdminId: ownerId, role: "EMPLOYEE", accountState: "ACTIVE" })).rejects.toThrow("Forbidden");
    await expect(pool.query("select role, authorization_version from app.admin_identities where admin_id = $1", [secondOwnerId])).resolves.toMatchObject({ rows: [{ role: "EMPLOYEE", authorization_version: "2" }] });
  });
});
