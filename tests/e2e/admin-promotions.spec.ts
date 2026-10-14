import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { Pool } from "pg";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import { findSelectableStarts } from "../../src/server/capabilities/operating-calendar/availability";

test("OWNER creates a promotion, reviews its public price, and the confirmed snapshot survives later edits", async ({ context, page }) => {
  const pool = createPool();
  try {
    const packageId = randomUUID();
    const packageName = `! E2E promotion service ${randomUUID().slice(0, 8)}`;
    const calendar = await pool.query<{ revision: number }>("select revision from app.operating_calendar where calendar_id = true");
    const revision = calendar.rows[0]?.revision;
    if (!revision) throw new Error("The browser fixture requires the operational calendar.");
    await pool.query("insert into app.service_packages (package_id, current_revision) values ($1, 1)", [packageId]);
    await pool.query(
      "insert into app.service_package_revisions (package_id, revision, name, description, price_centavos, duration_minutes, state) values ($1, 1, $2, 'Serviço sintético E2E', 12500, 30, 'ACTIVE')",
      [packageId, packageName],
    );
    const fixtureDate = await findUniqueDate(pool, packageId, revision);
    const localDate = fixtureDate.date;
    const actor = await createActor(pool, "OWNER");
    await context.addCookies([
      { name: "__Host-admin_session", value: actor.cookieValue, url: "https://localhost:3000", secure: true, httpOnly: true, sameSite: "Lax" },
      { name: "__Host-admin_csrf", value: actor.csrfToken, url: "https://localhost:3000", secure: true, httpOnly: false, sameSite: "Lax" },
    ]);

    const adminResponse = await page.goto("/admin/promotions");
    expect(adminResponse?.status()).toBe(200);
    const newPromotion = page.locator("section.step").filter({ has: page.getByRole("heading", { name: "Nova promoção" }) });
    await newPromotion.getByLabel("Nome da promoção").fill("Oferta E2E sintética");
    await newPromotion.getByLabel("Desconto", { exact: true }).fill("20");
    await newPromotion.getByLabel(packageName).check();
    await newPromotion.getByLabel("Válida a partir de (Fortaleza)").fill(localDate);
    await newPromotion.getByLabel("Válida até, inclusive (Fortaleza)").fill(localDate);
    const createResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/promotions") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Criar promoção" }).click();
    const createdResponse = await createResponse;
    expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json() as { promotionId: string };
    await expect(page.getByRole("status")).toContainText("Promoção criada.");

    const packagesResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/public/packages"));
    const publicPage = await page.goto("/booking");
    expect(publicPage?.status()).toBe(200);
    const packagesResponse = await packagesResponsePromise;
    const packages = await packagesResponse.json() as Array<{ id: string; hasPromotion: boolean }>;
    expect(packages.find((item) => item.id === packageId)?.hasPromotion).toBe(true);
    await page.getByRole("button").filter({ hasText: packageName }).click();
    const availabilityResponsePromise = page.waitForResponse((response) => response.url().includes("/api/public/availability?"));
    const day = page.locator(".day-list button").nth(fixtureDate.offset);
    await day.click();
    const availabilityResponse = await availabilityResponsePromise;
    expect(availabilityResponse.status()).toBe(200);
    const availability = await availabilityResponse.json() as { availableStarts: Array<{ start: string; price: { discountCentavos: string; finalPriceCentavos: string; promotion: { name: string } | null } }> };
    const promotedSlot = availability.availableStarts.find((slot) => slot.price.promotion?.name === "Oferta E2E sintética");
    expect(promotedSlot?.price).toMatchObject({ discountCentavos: "2500", finalPriceCentavos: "10000" });
    const localStartLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" }).format(new Date(promotedSlot!.start));
    await page.getByRole("button", { name: localStartLabel, exact: true }).click();
    await expect(page.getByRole("status")).toContainText("preço final conferido");
    await page.getByLabel("Nome completo").fill("Cliente E2E Sintético");
    await page.getByLabel("Telefone/WhatsApp").fill("85999990000");
    await page.getByLabel("CPF").fill("12345678909");
    await page.getByRole("button", { name: "Continuar" }).first().click();
    await page.getByLabel("Modelo").fill("Veículo sintético");
    await page.getByLabel("Placa").fill(`TST${randomUUID().slice(0, 4)}`);
    await page.getByLabel("Cor").fill("Prata");
    await page.getByRole("button", { name: "Continuar" }).last().click();
    await page.getByRole("button", { name: "Continuar" }).last().click();
    await page.getByLabel("PIX").check();
    const reviewResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/public/bookings/review"));
    await page.getByRole("button", { name: "Continuar" }).last().click();
    const reviewResponse = await reviewResponsePromise;
    expect(reviewResponse.status()).toBe(200);
    const review = await reviewResponse.json() as { price: { basePriceCentavos: string; discountCentavos: string; finalPriceCentavos: string; promotion: { name: string } | null } };
    expect(review.price).toMatchObject({ basePriceCentavos: "12500", discountCentavos: "2500", finalPriceCentavos: "10000", promotion: { name: "Oferta E2E sintética" } });
    await expect(page.getByText("Oferta E2E sintética · R$ 25,00 de desconto")).toBeVisible();
    await expect(page.getByText("R$ 100,00", { exact: true })).toBeVisible();

    const confirmationPromise = page.waitForResponse((response) => response.url().endsWith("/api/public/bookings") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();
    const confirmation = await confirmationPromise;
    expect(confirmation.status()).toBe(200);
    const confirmed = await confirmation.json() as { kind: string };
    expect(confirmed.kind).toBe("CONFIRMED");
    const intentKey = (confirmation.request().postDataJSON() as { intentKey: string }).intentKey;
    const bookingResult = await pool.query<{ bookingId: string }>(
      "select booking_id as \"bookingId\" from app.confirmation_intents where intent_key = $1 and state = 'COMMITTED'",
      [intentKey],
    );
    const bookingId = bookingResult.rows[0]?.bookingId;
    expect(bookingId).toBeTruthy();
    const snapshot = await pool.query(
      `select price_centavos::text as base, promotion_id as "promotionId", promotion_revision as "promotionRevision",
              promotion_name as "promotionName", discount_centavos::text as discount,
              final_price_centavos::text as final
       from app.booking_package_snapshots where booking_id = $1`,
      [bookingId],
    );
    expect(snapshot.rows).toEqual([{
      base: "12500", promotionId: created.promotionId, promotionRevision: 1,
      promotionName: "Oferta E2E sintética", discount: "2500", final: "10000",
    }]);
    await pool.query("update app.promotions set revision = 2, discount_value = 25 where promotion_id = $1", [created.promotionId]);
    const afterEdit = await pool.query(
      "select promotion_revision, discount_centavos::text as discount, final_price_centavos::text as final from app.booking_package_snapshots where booking_id = $1",
      [bookingId],
    );
    expect(afterEdit.rows).toEqual([{ promotion_revision: 1, discount: "2500", final: "10000" }]);
  } finally {
    await pool.end();
  }
});

test("EMPLOYEE cannot manage promotions and writes without CSRF are rejected", async ({ context, page }) => {
  const pool = createPool();
  try {
    const actor = await createActor(pool, "EMPLOYEE");
    await context.addCookies([
      { name: "__Host-admin_session", value: actor.cookieValue, url: "https://localhost:3000", secure: true, httpOnly: true, sameSite: "Lax" },
      { name: "__Host-admin_csrf", value: actor.csrfToken, url: "https://localhost:3000", secure: true, httpOnly: false, sameSite: "Lax" },
    ]);
    expect((await page.goto("/admin/promotions"))?.status()).toBe(404);
    const response = await page.request.post("/api/admin/promotions", {
      data: { name: "Negada", discountKind: "PERCENTAGE", discountValue: 10, packageIds: [randomUUID()], state: "ACTIVE", validFrom: "2080-01-01", validThrough: "2080-12-31" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({ kind: "FORBIDDEN" });
    const unauthorized = await page.request.post("/api/admin/promotions", {
      data: { name: "Negada", discountKind: "PERCENTAGE", discountValue: 10, packageIds: [randomUUID()], state: "ACTIVE", validFrom: "2080-01-01", validThrough: "2080-12-31" },
      headers: { origin: "http://localhost:3000", "x-csrf-token": actor.csrfToken },
    });
    expect(unauthorized.status()).toBe(403);
    expect(await unauthorized.json()).toEqual({ kind: "FORBIDDEN" });
  } finally {
    await pool.end();
  }
});

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for promotion browser verification.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 2 });
}

async function createActor(pool: Pool, role: "OWNER" | "EMPLOYEE") {
  const adminId = randomUUID();
  const issuer = `https://${randomUUID()}.example.test`;
  await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, $3, $4)", [adminId, issuer, adminId, role]);
  return createLocalSession(pool, { issuer, subject: adminId, mfaAssured: true });
}

async function findUniqueDate(pool: Pool, packageId: string, revision: number): Promise<Readonly<{ date: string; offset: number }>> {
  for (let offset = 1; offset < 14; offset += 1) {
    const localDate = dateKeyDaysFromNow(offset);
    const existing = await pool.query<{ isClosed: boolean; startsAt: string | null; endsAt: string | null }>(
      "select is_closed as \"isClosed\", starts_at::text as \"startsAt\", ends_at::text as \"endsAt\" from app.calendar_overrides where calendar_date = $1 and revision = $2",
      [localDate, revision],
    );
    if (existing.rows.length === 0) {
      await pool.query(
        `insert into app.calendar_overrides (override_id, calendar_date, starts_at, ends_at, is_closed, revision)
         values ($1, $2, '08:00', '12:00', false, $3)`,
        [randomUUID(), localDate, revision],
      );
    }
    if (existing.rows.length > 0 && (existing.rows[0]!.isClosed || !existing.rows[0]!.startsAt)) continue;
    const starts = Array.from({ length: 21 }, (_, index) => fortalezaInstant(localDate, 8 * 60 + index * 30));
    const available = await findSelectableStarts(pool, { packageId, starts });
    if (available.length > 0) return { date: localDate, offset };
  }
  throw new Error("The synthetic promotion browser fixture needs one selectable future date.");
}

function fortalezaInstant(date: string, minutes: number): Date {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return new Date(`${date}T${String(hour + 3).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`);
}

function dateKeyDaysFromNow(offset: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const localNoon = new Date(`${value("year")}-${value("month")}-${value("day")}T12:00:00Z`);
  localNoon.setUTCDate(localNoon.getUTCDate() + offset);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(localNoon);
}
