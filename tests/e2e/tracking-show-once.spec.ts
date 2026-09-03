import { expect, test } from "@playwright/test";

const rawCredential = "tracking_secret_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

test("shows a newly issued tracking credential once without URL or durable-browser storage leakage", async ({ page }) => {
  await page.route("**/api/public/packages**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111", name: "Lavagem completa", description: "Exterior e interior.", priceCentavos: "7500", durationMinutes: 90 }]),
  }));
  await page.route("**/api/public/availability**", async (route) => {
    const start = new URL(route.request().url()).searchParams.get("start") ?? new Date().toISOString();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ availableStarts: [{ start, end: start, packageRevision: 1, calendarRevision: 1 }] }) });
  });
  let submissions = 0;
  await page.route("**/api/public/bookings", async (route) => {
    submissions += 1;
    expect(route.request().url()).not.toContain(rawCredential);
    await route.fulfill({
      contentType: "application/json",
      headers: { "cache-control": "private, no-store, max-age=0" },
      body: JSON.stringify({ kind: "CONFIRMED", replayed: false, trackingCredential: rawCredential }),
    });
  });

  await reachReview(page);
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page.locator("output", { hasText: rawCredential })).toHaveText(rawCredential);
  expect(page.url()).not.toContain(rawCredential);
  expect(await page.evaluate((secret) => ({
    local: Object.values(localStorage).includes(secret),
    session: Object.values(sessionStorage).includes(secret),
    url: location.href.includes(secret),
  }), rawCredential)).toEqual({ local: false, session: false, url: false });

  await page.reload();
  await expect(page.getByText(rawCredential)).toHaveCount(0);
  expect(submissions).toBe(1);
});

async function reachReview(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/booking");
  await page.getByRole("button", { name: /Lavagem completa/ }).click();
  await page.getByRole("button", { name: /Hoje|Amanhã/ }).first().click();
  await page.getByRole("button", { name: /08:00/ }).first().click();
  await page.getByLabel("Nome completo").fill("Cliente Sintético");
  await page.getByLabel("Telefone/WhatsApp").fill("85999999999");
  await page.getByLabel("CPF").fill("12345678909");
  await page.getByRole("button", { name: "Continuar" }).first().click();
  await page.getByLabel("Modelo").fill("Hatch");
  await page.getByLabel("Placa").fill("ABC1D23");
  await page.getByLabel("Cor").fill("Prata");
  await page.getByRole("button", { name: "Continuar" }).last().click();
  await page.getByRole("button", { name: "Continuar" }).last().click();
  await page.getByLabel("PIX").check();
  await page.getByRole("button", { name: "Continuar" }).last().click();
}
