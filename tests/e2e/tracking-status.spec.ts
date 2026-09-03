import { expect, test } from "@playwright/test";

test("shows only the current status and refetches after browser back navigation", async ({ page }) => {
  let reads = 0;
  let invalidated = false;
  await page.route("**/api/public/tracking/status", async (route) => {
    reads += 1;
    await route.fulfill({
      status: invalidated ? 403 : 200,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store, max-age=0" },
      body: JSON.stringify(invalidated ? { kind: "TRACKING_SESSION_INVALID" } : { status: "IN_PROGRESS" }),
    });
  });

  await page.goto("/tracking/status");
  await expect(page.getByRole("status")).toHaveText("Em andamento");
  await expect(page.getByText(/CPF|placa|pacote|agendamento/i)).toHaveCount(0);
  const readsBeforeInvalidation = reads;
  invalidated = true;
  await page.goto("/");
  await page.goBack();
  await expect(page.getByText("Acesso de acompanhamento expirado ou inválido.")).toBeVisible();
  expect(reads).toBeGreaterThan(readsBeforeInvalidation);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
    .toEqual({ local: 0, session: 0 });
});

test("moves from proof to status without leaving the credential in history", async ({ page }) => {
  const rawCredential = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
  await page.route("**/api/public/tracking/proof", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store, max-age=0" },
    body: JSON.stringify({ kind: "TRACKING_SESSION_ESTABLISHED" }),
  }));
  await page.route("**/api/public/tracking/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store, max-age=0" },
    body: JSON.stringify({ status: "SCHEDULED" }),
  }));

  await page.goto("/tracking");
  await page.getByLabel("Código de acompanhamento").fill(rawCredential);
  await page.getByRole("button", { name: "Acompanhar" }).click();
  await page.getByRole("link", { name: "Ver status" }).click();
  await expect(page).toHaveURL("http://localhost:3000/tracking/status");
  await expect(page.getByRole("status")).toHaveText("Agendado");
  expect(page.url()).not.toContain(rawCredential);
  await page.goBack();
  expect(page.url()).toBe("http://localhost:3000/tracking");
  await expect(page.getByLabel("Código de acompanhamento")).toHaveValue("");
});
