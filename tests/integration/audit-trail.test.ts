import { afterEach, describe, expect, it } from "vitest";
import { writeAuditEvent } from "../../src/server/capabilities/audit-trail/writer";
import { withTransaction } from "../../src/server/persistence/transaction";
import { createIntegrationPool } from "../support/postgres";

describe("audit writer", () => { const pools: ReturnType<typeof createIntegrationPool>[] = []; afterEach(async()=>{await Promise.all(pools.splice(0).map(p=>p.end()))});
 it("persists only an allowlisted minimized envelope", async()=>{const pool=createIntegrationPool();pools.push(pool); const actor="11111111-1111-4111-8111-111111111111",target="22222222-2222-4222-8222-222222222222"; const id=await withTransaction(pool,c=>writeAuditEvent(c,{category:"AUTHORIZATION",action:"ACCESS_DENIED",outcome:"DENIED",actorRef:actor,targetRef:target})); expect(id).toMatch(/^[0-9a-f-]{36}$/);});
 it("rejects raw or unapproved fields", async()=>{const pool=createIntegrationPool();pools.push(pool); await expect(withTransaction(pool,c=>writeAuditEvent(c,{category:"AUTHORIZATION",action:"ACCESS_DENIED",outcome:"DENIED",actorRef:"11111111-1111-4111-8111-111111111111",targetRef:"22222222-2222-4222-8222-222222222222",password:"secret"} as never))).rejects.toThrow();}); });
