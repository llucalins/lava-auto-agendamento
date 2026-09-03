import "server-only";

import { Pool } from "pg";

import { getServerConfig } from "../shared/config";

let databasePool: Pool | undefined;

export function getDatabasePool(): Pool {
  databasePool ??= new Pool({
    connectionString: getServerConfig().databaseUrl,
    max: 10,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 30_000,
  });

  return databasePool;
}
