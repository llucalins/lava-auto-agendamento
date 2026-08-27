import { Pool } from "pg";

import { loadServerConfig } from "../../src/server/shared/config-schema";

export function createIntegrationPool() {
  const { databaseUrl } = loadServerConfig(process.env);

  return new Pool({
    allowExitOnIdle: true,
    connectionString: databaseUrl,
    max: 1,
  });
}
