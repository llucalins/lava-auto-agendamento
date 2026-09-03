import { expect, test } from "@playwright/test";

const globalPolicy = {
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
};

test("applies one browser security policy across public, admin, API, and tracking surfaces", async ({ request }) => {
  for (const path of ["/", "/booking", "/admin/bookings", "/tracking", "/tracking/status", "/api/public/tracking/status"]) {
    const response = await request.get(path);
    const headers = response.headers();
    for (const [name, value] of Object.entries(globalPolicy)) expect(headers[name], path).toBe(value);
    expect(headers["content-security-policy"], path).toContain("default-src 'self'");
    expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
  }
});

test("prevents sensitive caching, browser storage, framing, and cross-origin API reads", async ({ page, request }) => {
  for (const path of ["/booking", "/admin/bookings", "/tracking", "/tracking/status", "/api/public/tracking/status"]) {
    const response = await request.get(path);
    const cacheControl = response.headers()["cache-control"];
    expect(cacheControl, path).toMatch(path.startsWith("/api/") ? /no-store/ : /no-store|no-cache, must-revalidate/);
  }

  const crossOrigin = await request.get("/api/public/packages", { headers: { origin: "https://attacker.invalid" } });
  expect(crossOrigin.headers()["access-control-allow-origin"]).toBeUndefined();

  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/tracking");
  expect(consoleErrors).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
    .toEqual({ local: 0, session: 0 });

  await page.goto("/");
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.src = "/tracking";
    document.body.append(frame);
  });
  await expect.poll(() => consoleErrors.some((message) => /frame|ancestor/i.test(message))).toBe(true);
});
