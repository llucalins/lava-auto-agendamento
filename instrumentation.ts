import { loadServerConfig } from "./src/server/shared/config-schema";

export function register() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    loadServerConfig(process.env, true);
  }
}
