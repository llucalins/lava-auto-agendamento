import type { Pool, PoolClient } from "pg";

import { applyTransactionResourceLimits } from "../security/resource-controls";

type TransactionPool = Pick<Pool, "connect">;

export async function withTransaction<Result>(
  pool: TransactionPool,
  operation: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await applyTransactionResourceLimits(client);

    try {
      const result = await operation(client);

      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }
}
