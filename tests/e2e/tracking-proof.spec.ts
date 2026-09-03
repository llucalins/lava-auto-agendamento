import { expect, test } from "@playwright/test";

const rawCredential = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
const sessionCookie = "qrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY01234567";

test("proves a credential in the body and establishes a secure opaque session without browser leakage", async ({ context, page }) => {
  await page.route("**/api/public/tracking/proof", async (route) => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(request.url()).not.toContain(rawCredential);
    expect(request.headers().referer ?? "").not.toContain(rawCredential);
    expect(request.postDataJSON()).toEqual({ credential: rawCredential });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "cache-control": "private, no-store, max-age=0",
        "referrer-policy": "no-referrer",
        "set-cookie": `__Host-tracking_session=${sessionCookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=900`,
      },
      body: JSON.stringify({ kind: "TRACKING_SESSION_ESTABLISHED" }),
    });
  });

  await page.goto("/tracking");
  await page.getByLabel("Código de acompanhamento").fill(rawCredential);
  await page.getByRole("button", { name: "Acompanhar" }).click();
  await expect(page.getByRole("status")).toHaveText("Acesso de acompanhamento confirmado.");
  await expect(page.getByLabel("Código de acompanhamento")).toHaveValue("");
  expect(page.url()).toBe("http://localhost:3000/tracking");
  expect(await page.evaluate((secret) => ({
    cookie: document.cookie.includes(secret),
    local: Object.values(localStorage).includes(secret),
    session: Object.values(sessionStorage).includes(secret),
    history: performance.getEntriesByType("navigation").some((entry) => entry.name.includes(secret)),
  }), rawCredential)).toEqual({ cookie: false, local: false, session: false, history: false });
  expect(await context.cookies()).toEqual(expect.arrayContaining([expect.objectContaining({
    name: "__Host-tracking_session",
    value: sessionCookie,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  })]));
});

test("uses the same outward message for unusable proof categories", async ({ page }) => {
  await page.route("**/api/public/tracking/proof", (route) => route.fulfill({
    status: 403,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store, max-age=0" },
    body: JSON.stringify({ kind: "TRACKING_PROOF_FAILED" }),
  }));
  await page.goto("/tracking");
  await page.getByLabel("Código de acompanhamento").fill("malformed");
  await page.getByRole("button", { name: "Acompanhar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Não foi possível validar o código de acompanhamento." }))
    .toHaveText("Não foi possível validar o código de acompanhamento.");
});
