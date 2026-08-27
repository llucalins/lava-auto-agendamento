import { expect, test } from "@playwright/test";

test("accepts only payment intent methods without payment credentials", async ({ page }) => {
  await page.route("**/api/public/packages**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111", name: "Lavagem completa", description: "Exterior e interior.", priceCentavos: "7500", durationMinutes: 90 }]) }));
  await page.route("**/api/public/availability**", async (route) => { const start = new URL(route.request().url()).searchParams.get("start") ?? new Date().toISOString(); await route.fulfill({ contentType: "application/json", body: JSON.stringify({ availableStarts: [{ start, end: start, packageRevision: 1, calendarRevision: 1 }] }) }); });
  await page.goto("/booking");
  await page.getByRole("button", { name: /Lavagem completa/ }).click();
  await page.getByRole("button", { name: /Hoje|Amanhã/ }).first().click();
  await page.getByRole("button", { name: /08:00/ }).first().click();
  await page.getByLabel("Nome completo").fill("Cliente Sintético"); await page.getByLabel("Telefone/WhatsApp").fill("85999999999"); await page.getByLabel("CPF").fill("12345678909"); await page.getByRole("button", { name: "Continuar" }).first().click();
  await page.getByLabel("Modelo").fill("Hatch"); await page.getByLabel("Placa").fill("ABC1D23"); await page.getByLabel("Cor").fill("Prata"); await page.getByRole("button", { name: "Continuar" }).last().click(); await page.getByRole("button", { name: "Continuar" }).last().click();
  await expect(page.getByRole("heading", { name: "Como pretende pagar?" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).last().click(); await expect(page.getByRole("alert").filter({ hasText: "Escolha uma forma" })).toContainText("Escolha uma forma");
  await expect(page.locator('input[name="cardNumber"], input[name="cvv"], input[name="expiration"], input[name="bankCredential"], input[name="pixSecret"]')).toHaveCount(0);
  await page.getByLabel("PIX").check(); await page.getByRole("button", { name: "Continuar" }).last().click(); await expect(page.getByRole("heading", { name: "Revise seu agendamento" })).toBeVisible();
});
