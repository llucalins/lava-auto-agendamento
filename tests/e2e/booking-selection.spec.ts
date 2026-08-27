import { expect, test } from "@playwright/test";

test("selects a package, day, and compatible start on mobile", async ({ page }) => {
  await page.route("**/api/public/packages**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Lavagem completa",
          description: "Exterior e interior.",
          priceCentavos: "7500",
          durationMinutes: 90,
        },
      ]),
    });
  });
  await page.route("**/api/public/availability**", async (route) => {
    const url = new URL(route.request().url());
    const starts = url.searchParams.getAll("start");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        availableStarts: starts.slice(0, 2).map((start) => ({
          start,
          end: new Date(new Date(start).getTime() + 90 * 60_000).toISOString(),
          packageRevision: 1,
          calendarRevision: 1,
        })),
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/booking");

  await expect(page.getByRole("heading", { name: "Agende sua lavagem" })).toBeVisible();
  await page.getByRole("button", { name: /Lavagem completa/ }).click();
  await expect(page.getByRole("heading", { name: "Escolha o dia" })).toBeVisible();
  await page.getByRole("button", { name: /Hoje|Amanhã/ }).first().click();
  await expect(page.getByRole("heading", { name: "Escolha o horário" })).toBeVisible();
  await expect(page.getByRole("button", { name: /08:00/ }).first()).toBeVisible();
});
