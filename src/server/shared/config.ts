import "server-only";

import { loadServerConfig } from "./config-schema";

export type { ServerConfig } from "./config-schema";

export function getServerConfig() {
  return loadServerConfig(process.env, process.env.NODE_ENV === "production");
}
