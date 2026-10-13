import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext } from "@playwright/test";
import { Pool } from "pg";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import { allocateBookingCapacity } from "../../src/server/capabilities/booking-lifecycle/allocations";
import { persistBookingPii } from "../../src/server/capabilities/booking-lifecycle/pii-repository";
import { createScheduledBooking } from "../../src/server/capabilities/booking-lifecycle/repository";

test("an authenticated OWNER navigates bookings and performs essential audited actions", async ({ context, page }) => {
  const pool = createPool();
  const auditPool = createAuditPool();
  try {
    const session = await createOwnerSession(pool);
    await addSessionCookies(context, session);
    const [firstStart, secondStart] = await uniqueStartsToday(pool);
    const first = await createBookingFixture(pool, firstStart.toISOString());
    const second = await createBookingFixture(pool, secondStart.toISOString());

    await page.goto("/admin/bookings?category=today");
    await page.locator(`a[href="/admin/bookings/${first.bookingId}"]`).click();
    await expect(page.getByRole("heading", { name: "Detalhes do agendamento" })).toBeVisible();

    const started = page.waitForResponse((response) => response.url().endsWith(`/api/admin/bookings/${first.bookingId}`) && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "Iniciar atendimento" }).click();
    expect((await started).status()).toBe(200);
    await expect(page.getByRole("button", { name: "Concluir atendimento" })).toBeVisible();

    const completed = page.waitForResponse((response) => response.url().endsWith(`/api/admin/bookings/${first.bookingId}`) && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "Concluir atendimento" }).click();
    expect((await completed).status()).toBe(200);

    await page.goto(`/admin/bookings/${second.bookingId}`);
    const cancelled = page.waitForResponse((response) => response.url().endsWith(`/api/admin/bookings/${second.bookingId}`) && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "Cancelar agendamento" }).click();
    expect((await cancelled).status()).toBe(200);

    const state = await pool.query<{ booking_id: string; revision: number; status: string }>(
      "select booking_id, revision, status from app.bookings where booking_id = any($1::uuid[]) order by booking_id",
      [[first.bookingId, second.bookingId]],
    );
    expect(state.rows).toEqual(expect.arrayContaining([
      { booking_id: first.bookingId, revision: 3, status: "COMPLETED" },
      { booking_id: second.bookingId, revision: 2, status: "CANCELLED" },
    ]));
    const audits = await auditPool.query<{ count: string }>(
      "select count(*)::text as count from app.audit_events where target_ref = any($1::text[])",
      [[first.bookingId, second.bookingId]],
    );
    expect(audits.rows[0]?.count).toBe("3");
  } finally {
    await pool.end();
    await auditPool.end();
  }
});

test("offers an operational browser entry point for administrative login", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Entrar no painel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar com autenticação segura" })).toBeVisible();
});

async function createOwnerSession(pool: Pool) {
  const adminId = randomUUID();
  const issuer = `https://${randomUUID()}.admin-browser.example.test`;
  await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, $3, 'OWNER')", [adminId, issuer, adminId]);
  return createLocalSession(pool, { issuer, subject: adminId, mfaAssured: true });
}

async function createBookingFixture(pool: Pool, serviceStart: string) {
  const packageId = randomUUID();
  await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
  await pool.query("insert into app.service_package_revisions values ($1, 1, 'Admin browser', null, 7500, 30, 'ACTIVE')", [packageId]);
  const booking = await createScheduledBooking(pool, {
    packageId,
    serviceStart: new Date(serviceStart),
    serviceMode: "DROP_OFF",
    intendedPaymentMethod: "PIX",
  });
  if (!(await allocateBookingCapacity(pool, booking.bookingId))) throw new Error("Expected test capacity.");
  await persistBookingPii(pool, {
    bookingId: booking.bookingId,
    fullName: "Cliente Sintético",
    phoneWhatsapp: "85999999999",
    email: "cliente@example.test",
    cpf: "12345678909",
    vehicleModel: "Hatch",
    licencePlate: `TST${randomUUID().slice(0, 4)}`,
    vehicleColor: "Prata",
  });
  return booking;
}

async function addSessionCookies(context: BrowserContext, session: Awaited<ReturnType<typeof createLocalSession>>) {
  await context.addCookies([
    { name: "__Host-admin_session", value: session.cookieValue, url: "https://localhost:3000", secure: true, httpOnly: true, sameSite: "Lax" },
    { name: "__Host-admin_csrf", value: session.csrfToken, url: "https://localhost:3000", secure: true, httpOnly: false, sameSite: "Lax" },
  ]);
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for admin browser verification.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 4 });
}

function createAuditPool(): Pool {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required for admin audit verification.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 2 });
}

async function uniqueStartsToday(pool: Pool): Promise<readonly [Date, Date]> {
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
  const available: Date[] = [];
  for (let hour = 8; hour < 18 && available.length < 2; hour += 1) {
    const start = new Date(`${dateKey}T${String(hour).padStart(2, "0")}:00:00-03:00`);
    const end = new Date(start.getTime() + 30 * 60_000);
    const occupied = await pool.query(
      `select 1
       from app.capacity_allocations allocation
       where allocation.capacity_unit_id = (
         select capacity_unit_id from app.capacity_units where state = 'ACTIVE' order by ordinal limit 1
       )
         and allocation.allocation_state = 'ACTIVE'
         and allocation.consumes_capacity
         and allocation.service_start < $2
         and allocation.service_end > $1
       limit 1`,
      [start, end],
    );
    if (occupied.rowCount === 0) available.push(start);
  }
  if (available.length !== 2) throw new Error("Two free synthetic admin slots are required for today's list fixture.");
  return [available[0]!, available[1]!];
}
