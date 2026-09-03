import { Pool } from "pg";

import { loadServerConfig } from "../../src/server/shared/config-schema";

export function createIntegrationPool() {
  return createPool(1);
}

export function createConcurrentIntegrationPool() {
  return createPool(4);
}

export function createMigrationIntegrationPool() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required for privileged integration-test inspection.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 1 });
}

function createPool(max: number) {
  const { databaseUrl } = loadServerConfig(process.env);

  return new Pool({
    allowExitOnIdle: true,
    connectionString: databaseUrl,
    max,
  });
}
