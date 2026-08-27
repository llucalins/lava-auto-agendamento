import { afterEach, describe, expect, it } from "vitest";
import { writeAuditEvent } from "../../src/server/capabilities/audit-trail/writer";
import { withTransaction } from "../../src/server/persistence/transaction";
import { createIntegrationPool } from "../support/postgres";

describe("runtime audit privileges", () => {
  const pools: ReturnType<typeof createIntegrationPool>[] = [];
  afterEach(async () => { await Promise.all(pools.splice(0).map((pool) => pool.end())); });
  it("allows minimized inserts but rejects audit-history mutation and DDL", async () => {
    const pool = createIntegrationPool(); pools.push(pool);
    const eventId = await withTransaction(pool, (client) => writeAuditEvent(client, { category: "SECURITY_FAILURE", action: "PRIVILEGE_PROBE", outcome: "DENIED", actorRef: "11111111-1111-4111-8111-111111111111", targetRef: "22222222-2222-4222-8222-222222222222" }));
    await expect(pool.query("update app.audit_events set outcome = 'SUCCEEDED' where event_id = $1", [eventId])).rejects.toThrow();
    await expect(pool.query("delete from app.audit_events where event_id = $1", [eventId])).rejects.toThrow();
    await expect(pool.query("truncate app.audit_events")).rejects.toThrow();
    await expect(pool.query("alter table app.audit_events add column forbidden_probe text")).rejects.toThrow();
    await expect(pool.query("drop schema app")).rejects.toThrow();
    await pool.query("grant select on app.audit_events to lava_test");
    await expect(pool.query("select * from app.audit_events where event_id = $1", [eventId])).rejects.toThrow();
  });
});
