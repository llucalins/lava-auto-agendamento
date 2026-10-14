import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext } from "@playwright/test";
import { Pool } from "pg";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";

test("OWNER creates a service and promotion; customer books against live calendar availability, tracks status, and keeps the confirmed price snapshot", async ({ browser }) => {
  const pool = createPool();
  const ownerContext = await browser.newContext();
  const customerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const customerPage = await customerContext.newPage();

  try {
    const owner = await createOwner(pool);
    await addSessionCookies(ownerContext, owner);

    const suffix = randomUUID().slice(0, 8);
    const packageName = `! E2E 00000000 ${suffix}`;
    const promotionName = `Oferta E2E ${suffix}`;
    const packageResponse = await ownerPage.goto("/admin/packages");
    expect(packageResponse?.status()).toBe(200);
    await ownerPage.getByLabel("Nome do novo pacote").fill(packageName);
    await ownerPage.getByLabel("Descrição do novo pacote").fill("Serviço sintético para teste integrado.");
    await ownerPage.getByLabel("Preço em centavos do novo pacote").fill("12500");
    await ownerPage.getByLabel("Duração em minutos do novo pacote").fill("30");
    const packageCreated = ownerPage.waitForResponse((response) => response.url().endsWith("/api/admin/packages") && response.request().method() === "POST");
    await ownerPage.getByRole("button", { name: "Criar pacote" }).click();
    expect((await packageCreated).status()).toBe(201);
    await expect(ownerPage.getByRole("status")).toContainText("Pacote criado.");
    const packageId = await pool.query<{ packageId: string }>(
      `select package_id as "packageId" from app.service_package_revisions where name = $1 and revision = 1`,
      [packageName],
    );
    const serviceId = packageId.rows[0]?.packageId;
    expect(serviceId).toBeTruthy();

    let serviceDate = "";
    let availableStart = "";
    for (let offset = 1; offset < 14 && !availableStart; offset += 1) {
      const date = dateKeyDaysFromNow(offset);
      const starts = Array.from({ length: 18 }, (_, index) => fortalezaInstant(date, 8 * 60 + index * 30));
      const availability = await ownerPage.request.get(availabilityUrl(serviceId!, starts));
      expect(availability.status()).toBe(200);
      const body = await availability.json() as { availableStarts: Array<{ start: string }> };
      availableStart = body.availableStarts[0]?.start ?? "";
      if (availableStart) serviceDate = date;
    }
    expect(availableStart).toBeTruthy();

    await ownerPage.goto("/admin/promotions");
    const promotionForm = ownerPage.locator("section.step").filter({ has: ownerPage.getByRole("heading", { name: "Nova promoção" }) });
    await promotionForm.getByLabel("Nome da promoção").fill(promotionName);
    await promotionForm.getByLabel("Desconto", { exact: true }).fill("20");
    await promotionForm.locator(`input[name="packageIds"][value="${serviceId}"]`).check();
    await promotionForm.getByLabel("Válida a partir de (Fortaleza)").fill(serviceDate);
    await promotionForm.getByLabel("Válida até, inclusive (Fortaleza)").fill(serviceDate);
    const promotionCreated = ownerPage.waitForResponse((response) => response.url().endsWith("/api/admin/promotions") && response.request().method() === "POST");
    await promotionForm.getByRole("button", { name: "Criar promoção" }).click();
    const createdResponse = await promotionCreated;
    expect(createdResponse.status()).toBe(201);
    const promotion = await createdResponse.json() as { promotionId: string };
    await expect(ownerPage.getByRole("status")).toContainText("Promoção criada.");

    await customerPage.goto("/booking");
    await customerPage.locator(".package-card").filter({ hasText: packageName }).click();
    const dayOffset = dayOffsetFromNow(serviceDate);
    await customerPage.locator(".day-list button").nth(dayOffset).click();
    const timeLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" }).format(new Date(availableStart));
    await customerPage.getByRole("button", { name: timeLabel, exact: true }).click();
    await customerPage.getByLabel("Nome completo").fill("Cliente E2E sintético");
    await customerPage.getByLabel("Telefone/WhatsApp").fill("85999990001");
    await customerPage.getByLabel("CPF").fill("12345678909");
    await customerPage.getByRole("button", { name: "Continuar" }).first().click();
    await customerPage.getByLabel("Modelo").fill("Hatch sintético");
    await customerPage.getByLabel("Placa").fill(`TST${suffix.slice(0, 4)}`);
    await customerPage.getByLabel("Cor").fill("Prata");
    await customerPage.getByRole("button", { name: "Continuar" }).last().click();
    await customerPage.getByRole("button", { name: "Continuar" }).last().click();
    await customerPage.getByLabel("PIX").check();
    const reviewResponsePromise = customerPage.waitForResponse((response) => response.url().endsWith("/api/public/bookings/review"));
    await customerPage.getByRole("button", { name: "Continuar" }).last().click();
    const reviewResponse = await reviewResponsePromise;
    expect(reviewResponse.status()).toBe(200);
    const review = await reviewResponse.json() as { price: { basePriceCentavos: string; discountCentavos: string; finalPriceCentavos: string; promotion: { id: string } | null } };
    expect(review.price).toMatchObject({ basePriceCentavos: "12500", discountCentavos: "2500", finalPriceCentavos: "10000", promotion: { id: promotion.promotionId } });
    await expect(customerPage.locator("dd").filter({ hasText: promotionName })).toBeVisible();
    await expect(customerPage.getByText("R$ 100,00", { exact: true })).toBeVisible();

    const confirmationPromise = customerPage.waitForResponse((response) => response.url().endsWith("/api/public/bookings") && response.request().method() === "POST");
    await customerPage.getByRole("button", { name: "Confirmar agendamento" }).click();
    const confirmation = await confirmationPromise;
    expect(confirmation.status()).toBe(200);
    expect(await confirmation.json()).toMatchObject({ kind: "CONFIRMED", replayed: false });
    const intentKey = (confirmation.request().postDataJSON() as { intentKey: string }).intentKey;
    const committed = await pool.query<{ bookingId: string }>(
      "select booking_id as \"bookingId\" from app.confirmation_intents where intent_key = $1 and state = 'COMMITTED'",
      [intentKey],
    );
    const bookingId = committed.rows[0]?.bookingId;
    expect(bookingId).toBeTruthy();
    const confirmedSnapshot = await readPriceSnapshot(pool, bookingId!);
    expect(confirmedSnapshot).toMatchObject({ base: "12500", discount: "2500", final: "10000", promotion: promotion.promotionId, revision: 1, name: promotionName });
    const trackingCredential = await customerPage.locator('output[aria-label="Código de acompanhamento"]').textContent();
    expect(trackingCredential).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const category = dayOffset === 0 ? "today" : "upcoming";
    const rank = await pool.query<{ rank: number }>(
      `select count(*)::int as rank
       from app.bookings booking cross join app.operating_calendar calendar
       where booking.status = 'SCHEDULED'
         and (booking.service_start at time zone calendar.timezone)::date > (now() at time zone calendar.timezone)::date
         and (booking.service_start, booking.booking_id) <= ($1::timestamptz, $2::uuid)`,
      [availableStart, bookingId],
    );
    const bookingPage = Math.max(1, Math.ceil(rank.rows[0].rank / 50));
    await ownerPage.goto(`/admin/bookings?category=${category}&status=SCHEDULED&page=${bookingPage}`);
    const pagination = ownerPage.getByRole("navigation", { name: "Paginação de agendamentos" });
    await expect(pagination.getByText(`Página ${bookingPage}`)).toBeVisible();
    if (bookingPage > 1) await expect(pagination.getByRole("link", { name: "Página anterior" })).toBeVisible();
    await expect(ownerPage.locator(`a[href="/admin/bookings/${bookingId}"]`)).toContainText(packageName);
    await expect(ownerPage.locator(`a[href="/admin/bookings/${bookingId}"]`)).toContainText("100,00");
    await ownerPage.locator(`a[href="/admin/bookings/${bookingId}"]`).click();
    await expect(ownerPage.getByText("Preço final confirmado")).toBeVisible();
    await expect(ownerPage.getByText("Oferta E2E", { exact: false })).toBeVisible();
    await expect(ownerPage.getByText("100,00")).toBeVisible();
    const statusUpdate = ownerPage.waitForResponse((response) => response.url().endsWith(`/api/admin/bookings/${bookingId}`) && response.request().method() === "PATCH");
    await ownerPage.getByRole("button", { name: "Iniciar atendimento" }).click();
    expect((await statusUpdate).status()).toBe(200);
    await expect(ownerPage.getByRole("button", { name: "Concluir atendimento" })).toBeVisible();

    await customerPage.goto("/tracking");
    await customerPage.getByLabel("Código de acompanhamento").fill(trackingCredential!);
    await customerPage.getByRole("button", { name: "Acompanhar" }).click();
    await expect(customerPage.getByRole("status")).toContainText("Acesso de acompanhamento confirmado");
    await customerPage.getByRole("link", { name: "Ver status" }).click();
    await expect(customerPage.getByRole("status")).toHaveText("Em andamento");

    await ownerPage.goto("/admin/promotions");
    const editedPromotion = ownerPage.locator(`fieldset[aria-label="Editar promoção ${promotionName}"]`);
    await editedPromotion.locator('select[name="state"]').selectOption("INACTIVE");
    const deactivated = ownerPage.waitForResponse((response) => response.url().endsWith(`/api/admin/promotions/${promotion.promotionId}`) && response.request().method() === "PATCH");
    await editedPromotion.getByRole("button", { name: "Salvar promoção" }).click();
    expect((await deactivated).status()).toBe(200);
    await expect(ownerPage.getByRole("status")).toContainText("Promoção atualizada.");
    expect(await readPriceSnapshot(pool, bookingId!)).toEqual(confirmedSnapshot);
  } finally {
    await Promise.all([ownerContext.close(), customerContext.close(), pool.end()]);
  }
});

async function createOwner(pool: Pool) {
  const adminId = randomUUID();
  const issuer = `https://${randomUUID()}.combined-e2e.example.test`;
  await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, $3, 'OWNER')", [adminId, issuer, adminId]);
  return createLocalSession(pool, { issuer, subject: adminId, mfaAssured: true });
}

async function addSessionCookies(context: BrowserContext, session: Awaited<ReturnType<typeof createLocalSession>>) {
  await context.addCookies([
    { name: "__Host-admin_session", value: session.cookieValue, url: "https://localhost:3000", secure: true, httpOnly: true, sameSite: "Lax" },
    { name: "__Host-admin_csrf", value: session.csrfToken, url: "https://localhost:3000", secure: true, httpOnly: false, sameSite: "Lax" },
  ]);
}

async function readPriceSnapshot(pool: Pool, bookingId: string) {
  const result = await pool.query<{ base: string; discount: string; final: string; promotion: string | null; revision: number | null; name: string | null }>(
    `select price_centavos::text as base, discount_centavos::text as discount, final_price_centavos::text as final,
            promotion_id as promotion, promotion_revision as revision, promotion_name as name
     from app.booking_package_snapshots where booking_id = $1`,
    [bookingId],
  );
  return result.rows[0];
}

function dateKeyDaysFromNow(offset: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const localNoon = new Date(`${value("year")}-${value("month")}-${value("day")}T12:00:00Z`);
  localNoon.setUTCDate(localNoon.getUTCDate() + offset);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(localNoon);
}

function dayOffsetFromNow(date: string): number {
  const target = new Date(`${date}T12:00:00Z`).getTime();
  const today = new Date(`${dateKeyDaysFromNow(0)}T12:00:00Z`).getTime();
  return Math.round((target - today) / 86_400_000);
}

function fortalezaInstant(date: string, minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return new Date(`${date}T${String(hour + 3).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`).toISOString();
}

function availabilityUrl(packageId: string, starts: readonly string[]): string {
  const query = new URLSearchParams({ packageId });
  starts.forEach((start) => query.append("start", start));
  return `/api/public/availability?${query.toString()}`;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for the local combined E2E fixture.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 4 });
}
