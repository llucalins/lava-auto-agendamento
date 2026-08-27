import { expect, test } from "@playwright/test";

test("collects personal data after selecting a compatible start without exposing it in the URL", async ({ page }) => {
  await page.route("**/api/public/packages**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111", name: "Lavagem completa", description: "Exterior e interior.", priceCentavos: "7500", durationMinutes: 90 }]) }));
  await page.route("**/api/public/availability**", async (route) => {
    const start = new URL(route.request().url()).searchParams.get("start") ?? new Date().toISOString();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ availableStarts: [{ start, end: start, packageRevision: 1, calendarRevision: 1 }] }) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/booking");
  await page.getByRole("button", { name: /Lavagem completa/ }).click();
  await page.getByRole("button", { name: /Hoje|Amanhã/ }).first().click();
  await page.getByRole("button", { name: /08:00/ }).first().click();
  await expect(page.getByRole("heading", { name: "Seus dados" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  const validation = page.getByRole("alert").filter({ hasText: "Preencha nome" });
  await expect(validation).toContainText("Preencha nome");
  await expect(validation).not.toContainText("123456");
  await page.getByLabel("Nome completo").fill("Cliente Sintético");
  await page.getByLabel("Telefone/WhatsApp").fill("85999999999");
  await page.getByLabel("CPF").fill("12345678909");
  await page.getByRole("button", { name: "Continuar" }).first().click();
  await expect(page.getByRole("heading", { name: "Seu veículo" })).toBeVisible();
  await expect(page).not.toHaveURL(/Cliente|123456|999999/);
});
