import { expect, test } from "@playwright/test";

test("landing page presents navigation and an honest empty catalog state", async ({ page }) => {
  await page.route("**/api/public/packages", (route) => route.fulfill({
    contentType: "application/json",
    body: "[]",
  }));

  await page.goto("/");

  await expect(page.getByRole("link", { name: "Lava Auto" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /cuidado automotivo sem complicação/i })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /principal/i }).getByRole("link", { name: "Agendar" })).toHaveAttribute("href", "/booking");
  await expect(page.getByText("Nenhum pacote disponível no momento.")).toBeVisible();
});

test("landing page reports a catalog failure and offers retry", async ({ page }) => {
  let attempts = 0;
  let retryRequested = false;
  await page.route("**/api/public/packages", async (route) => {
    attempts += 1;
    await route.fulfill({ status: retryRequested ? 200 : 503, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await expect(page.locator(".notice-error")).toContainText("Não foi possível carregar os serviços");
  retryRequested = true;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("Nenhum pacote disponível no momento.")).toBeVisible();
  expect(attempts).toBeGreaterThanOrEqual(2);
});

test("service catalog carries the selected package into booking", async ({ page }) => {
  await page.route("**/api/public/packages", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111", name: "Lavagem sintética", description: "Pacote de teste.", priceCentavos: "7500", durationMinutes: 90 }]),
  }));

  await page.goto("/");
  await page.getByRole("link", { name: "Ver horários" }).click();
  await expect(page).toHaveURL(/\/booking\?packageId=11111111-1111-4111-8111-111111111111/);
  await expect(page.getByRole("heading", { name: "Escolha o dia" })).toBeVisible();
  await expect(page.getByText("Lavagem sintética", { exact: true })).toBeVisible();
});

test("booking offers a package-specific slot and authoritative, no-PII demo review", async ({ page }) => {
  test.skip(process.env.RUN_PII_DISABLED_E2E !== "true", "Requires a production server with PII_PROCESSING_APPROVED=false");
  await page.route("**/api/public/packages", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111", name: "Lavagem sintética", description: "Pacote de teste.", priceCentavos: "7500", durationMinutes: 90 }]),
  }));
  await page.route("**/api/public/availability**", async (route) => {
    const url = new URL(route.request().url());
    const start = url.searchParams.get("start");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ availableStarts: start ? [{ start, end: new Date(new Date(start).getTime() + 90 * 60_000).toISOString() }] : [] }) });
  });
  await page.route("**/api/public/bookings/review", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ kind: "READY", package: { id: "11111111-1111-4111-8111-111111111111", name: "Lavagem sintética", description: "Pacote de teste.", priceCentavos: "7500", durationMinutes: 90, revision: 1 }, calendarRevision: 1, start: "2026-10-15T11:00:00.000Z", end: "2026-10-15T12:30:00.000Z", reviewToken: "synthetic-review-token" }),
  }));

  await page.goto("/booking");
  await page.getByRole("button", { name: /Lavagem sintética/ }).click();
  await page.getByRole("button", { name: /Hoje|Amanhã/ }).first().click();
  await page.getByRole("button", { name: /08:00/ }).first().click();

  await expect(page.getByText("Demonstração limitada")).toBeVisible();
  await expect(page.getByLabel("Revisão demonstrativa").getByText("Lavagem sintética")).toBeVisible();
  await expect(page.getByLabel("CPF")).toHaveCount(0);
  await expect(page.getByLabel("Nome completo")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirmar agendamento" })).toHaveCount(0);
  const blockedConfirmation = await page.evaluate(async () => {
    const response = await fetch("/api/public/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return { status: response.status, body: await response.json() };
  });
  expect(blockedConfirmation).toEqual({ status: 503, body: { kind: "UNAVAILABLE" } });
});

test("admin login page offers only the configured Google OIDC entry", async ({ page }) => {
  await page.goto("/admin/login");

  await expect(page.getByRole("heading", { name: "Acesso administrativo" })).toBeVisible();
  await expect(page.getByRole("button", { name: /continuar com google/i })).toBeVisible();
  await expect(page.getByLabel(/senha/i)).toHaveCount(0);
});
