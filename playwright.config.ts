import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Browser E2E shares a single-capacity PostgreSQL fixture; serialize specs to isolate bookings.
  workers: 1,
  use: { baseURL: "http://localhost:3000" },
});
