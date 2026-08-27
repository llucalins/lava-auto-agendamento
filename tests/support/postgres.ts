import { Pool } from "pg";

import { loadServerConfig } from "../../src/server/shared/config-schema";

export function createIntegrationPool() {
  return createPool(1);
}

export function createConcurrentIntegrationPool() {
  return createPool(4);
}

function createPool(max: number) {
  const { databaseUrl } = loadServerConfig(process.env);

  return new Pool({
    allowExitOnIdle: true,
    connectionString: databaseUrl,
    max,
  });
}
