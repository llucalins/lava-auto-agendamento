import { expect, test } from "@playwright/test";

test("exposes fail-closed login, callback, and logout routes from the active App Router", async ({ request }) => {
  const login = await request.post("/api/admin/auth/login", { headers: { origin: "http://localhost:3000" } });
  expect(login.status()).toBe(503);
  expect(await login.json()).toEqual({ kind: "AUTHENTICATION_UNAVAILABLE" });

  const callback = await request.get("/api/admin/auth/callback");
  expect(callback.status()).toBe(400);
  expect(await callback.json()).toEqual({ kind: "AUTHENTICATION_FAILED" });

  const logout = await request.post("/api/admin/auth/logout", { headers: { origin: "http://localhost:3000" } });
  expect(logout.status()).toBe(403);
  expect(await logout.json()).toEqual({ kind: "CSRF_FAILED" });
});
