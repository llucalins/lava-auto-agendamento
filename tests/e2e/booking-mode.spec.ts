import { expect, test } from "@playwright/test";

test("requires pickup address and clears it when switching to drop-off", async ({ page }) => {
  await page.route("**/api/public/packages**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111", name: "Lavagem completa", description: "Exterior e interior.", priceCentavos: "7500", durationMinutes: 90 }]) }));
  await page.route("**/api/public/availability**", async (route) => {
    const start = new URL(route.request().url()).searchParams.get("start") ?? new Date().toISOString();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ availableStarts: [{ start, end: start, packageRevision: 1, calendarRevision: 1 }] }) });
  });
  await page.goto("/booking");
  await page.getByRole("button", { name: /Lavagem completa/ }).click();
  await page.getByRole("button", { name: /Hoje|Amanhã/ }).first().click();
  await page.getByRole("button", { name: /08:00/ }).first().click();
  await page.getByLabel("Nome completo").fill("Cliente Sintético");
  await page.getByLabel("Telefone/WhatsApp").fill("85999999999");
  await page.getByLabel("CPF").fill("12345678909");
  await page.getByRole("button", { name: "Continuar" }).first().click();
  await page.getByLabel("Modelo").fill("Hatch sintético");
  await page.getByLabel("Placa").fill("ABC1D23");
  await page.getByLabel("Cor").fill("Prata");
  await page.getByRole("button", { name: "Continuar" }).last().click();
  await expect(page.getByRole("heading", { name: /Como você/ })).toBeVisible();
  await page.getByLabel(/Solicitar retirada/).check();
  await page.getByRole("button", { name: "Continuar" }).last().click();
  await expect(page.getByRole("alert").filter({ hasText: "Informe o endereço" })).toContainText("Informe o endereço");
  await page.getByLabel("Endereço para retirada").fill("Rua Sintética, 100");
  await page.getByLabel(/Deixarei o veículo/).check();
  await expect(page.getByLabel("Endereço para retirada")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar" }).last().click();
  await expect(page.getByRole("heading", { name: "Como pretende pagar?" })).toBeVisible();
});
