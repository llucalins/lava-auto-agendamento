import { expect, test } from "@playwright/test";

test("denies an unauthenticated booking-list request", async ({ page }) => {
  const response = await page.goto("/admin/bookings");

  expect(response?.status()).toBe(404);
  await expect(page.getByText("CPF")).toHaveCount(0);
  await expect(page.getByText("Endereço de retirada")).toHaveCount(0);
});
