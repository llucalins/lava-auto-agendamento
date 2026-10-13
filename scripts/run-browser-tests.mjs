import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = "http://localhost:3000";
const nextCli = "./node_modules/next/dist/bin/next";
const playwrightCli = "./node_modules/@playwright/test/cli.js";
const testResults = resolve("test-results");
await mkdir(testResults, { recursive: true });
const browserTemp = await mkdtemp(resolve(testResults, "playwright-temp-"));
const childEnv = { ...process.env, TEMP: browserTemp, TMP: browserTemp };
const server = spawn(process.execPath, [nextCli, "dev"], {
  detached: process.platform !== "win32",
  // Browser E2E uses synthetic fixtures and must never inherit a production fingerprint secret.
  env: {
    ...childEnv,
    APP_ORIGIN: baseUrl,
    CONFIRMATION_FINGERPRINT_KEY: "playwright-only-confirmation-signing-key-not-for-production",
  },
  stdio: "inherit",
});

let stopping = false;

async function stopServer() {
  if (stopping || server.exitCode !== null || server.pid === undefined) return;
  stopping = true;

  if (process.platform === "win32") {
    server.kill("SIGINT");
    await Promise.race([
      new Promise((resolve) => server.once("close", resolve)),
      delay(5_000),
    ]);
    if (server.exitCode !== null) return;

    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.once("close", resolve);
      killer.once("error", resolve);
    });
    return;
  }

  process.kill(-server.pid, "SIGTERM");
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js exited before readiness (${server.exitCode}).`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(200);
  }
  throw new Error("Next.js did not become ready within 60 seconds.");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await stopServer();
    process.exitCode = 1;
  });
}

try {
  await waitForServer();
  const playwright = spawn(
    process.execPath,
    [playwrightCli, "test", "--pass-with-no-tests", ...process.argv.slice(2)],
    { env: childEnv, stdio: "inherit" },
  );
  const exitCode = await new Promise((resolve, reject) => {
    playwright.once("close", (code) => resolve(code ?? 1));
    playwright.once("error", reject);
  });
  process.exitCode = exitCode;
} finally {
  await stopServer();
  await rm(browserTemp, { force: true, recursive: true, maxRetries: 0 }).catch(() => undefined);
}
