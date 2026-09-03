import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: process.env.CI ? 1 : undefined,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: process.platform === "win32" ? "npm.cmd run dev" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    env: { ...process.env, APP_ORIGIN: "http://localhost:3000" },
  },
});
