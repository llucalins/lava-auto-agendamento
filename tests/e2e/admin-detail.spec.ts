import { expect, test } from "@playwright/test";

test("denies an unauthenticated booking-detail request without exposing its projection", async ({ page }) => {
  const response = await page.goto("/admin/bookings/11111111-1111-4111-8111-111111111111");

  expect(response?.status()).toBe(404);
  await expect(page.getByText("CPF")).toHaveCount(0);
  await expect(page.getByText("Endereço de retirada")).toHaveCount(0);
  await expect(page.getByText("ABC1D23")).toHaveCount(0);
});
