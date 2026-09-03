import { afterEach, describe, expect, it, vi } from "vitest";

import { createAbuseControl } from "../../src/server/security/abuse-controls";
import {
  ResourceLimitError,
  assertBoundedDateWindow,
  parseBoundedPage,
  readBoundedJson,
  runWithBoundedRetry,
  runWithRouteConcurrency,
} from "../../src/server/security/resource-controls";
import { withTransaction } from "../../src/server/persistence/transaction";
import { createIntegrationPool } from "../support/postgres";

describe("resource controls", () => {
  const pools: ReturnType<typeof createIntegrationPool>[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
  });

  it("rejects oversized streamed bodies and bounds page/date work", async () => {
    const request = new Request("https://example.test", { method: "POST", body: JSON.stringify({ value: "x".repeat(1_100) }) });
    await expect(readBoundedJson(request, 1_024)).rejects.toBeInstanceOf(ResourceLimitError);
    expect(parseBoundedPage("2", "50", 100)).toEqual({ page: 2, pageSize: 50, offset: 50 });
    expect(() => parseBoundedPage("0", "101", 100)).toThrow(ResourceLimitError);
    expect(() => assertBoundedDateWindow(new Date("2026-01-01T00:00:00Z"), new Date("2026-02-02T00:00:00Z"), 31)).toThrow(ResourceLimitError);
  });

  it("retries only the configured number of times", async () => {
    vi.useFakeTimers();
    const operation = vi.fn().mockRejectedValueOnce(new Error("retry")).mockResolvedValue("ok");
    const promise = runWithBoundedRetry(operation, { attempts: 2, baseDelayMs: 10, isRetryable: () => true, random: () => 0 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("fails fast when process-local concurrency is exhausted and identifies it as defense in depth", async () => {
    let release!: () => void;
    const first = runWithRouteConcurrency("tracking-proof", () => new Promise<void>((resolve) => { release = resolve; }), 1);
    await expect(runWithRouteConcurrency("tracking-proof", async () => undefined, 1)).rejects.toMatchObject({ code: "OVERLOADED" });
    release();
    await first;

    const local = createAbuseControl({ limit: 1, windowMs: 60_000 });
    expect(local.enforcement).toBe("PROCESS_LOCAL_DEFENSE_IN_DEPTH");
    await expect(local.check({ routeClass: "tracking-proof", signalRefs: ["network:a", "client:b"] })).resolves.toEqual({ allowed: true });
    await expect(local.check({ routeClass: "tracking-proof", signalRefs: ["network:a", "client:b"] })).resolves.toMatchObject({ allowed: false });

    const shared = createAbuseControl({ provider: { check: async () => ({ allowed: true }) } });
    expect(shared.enforcement).toBe("SHARED_EDGE_PROVIDER");
  });

  it("sets PostgreSQL statement, lock, and whole-transaction timeouts locally", async () => {
    const pool = createIntegrationPool();
    pools.push(pool);
    const settings = await withTransaction(pool, async (client) => (await client.query<{
      statement: string; lock: string; transaction: string;
    }>(`select current_setting('statement_timeout') as statement,
              current_setting('lock_timeout') as lock,
              current_setting('transaction_timeout') as transaction`)).rows[0]);
    expect(settings).toEqual({ statement: "5s", lock: "1s", transaction: "15s" });
  });
});
