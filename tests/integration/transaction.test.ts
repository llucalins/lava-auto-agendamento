import { afterEach, describe, expect, it } from "vitest";

import { withTransaction } from "../../src/server/persistence/transaction";
import { createIntegrationPool } from "../support/postgres";

describe("withTransaction", () => {
  const pools: ReturnType<typeof createIntegrationPool>[] = [];

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
  });

  it("commits work performed on one checked-out PostgreSQL client and releases it", async () => {
    const pool = createIntegrationPool();
    pools.push(pool);
    let transactionBackendPid = "";

    await withTransaction(pool, async (client) => {
      transactionBackendPid = (
        await client.query<{ backend_pid: string }>("select pg_backend_pid()::text as backend_pid")
      ).rows[0].backend_pid;
      await client.query("create temporary table transaction_commit_probe (value integer not null)");
      await client.query("insert into transaction_commit_probe (value) values (1)");
    });

    const result = await pool.query<{ backend_pid: string; count: string }>(
      "select pg_backend_pid()::text as backend_pid, count(*)::text as count from transaction_commit_probe",
    );

    expect(result.rows[0]).toEqual({ backend_pid: transactionBackendPid, count: "1" });
    expect(pool.idleCount).toBe(1);
  });

  it("rolls back failed work and releases the checked-out client", async () => {
    const pool = createIntegrationPool();
    pools.push(pool);

    await expect(
      withTransaction(pool, async (client) => {
        await client.query("create temporary table transaction_rollback_probe (value integer not null)");
        throw new Error("rollback probe");
      }),
    ).rejects.toThrow("rollback probe");

    const result = await pool.query<{ relation: string | null }>(
      "select to_regclass('pg_temp.transaction_rollback_probe')::text as relation",
    );

    expect(result.rows[0].relation).toBeNull();
    expect(pool.idleCount).toBe(1);
  });
});
