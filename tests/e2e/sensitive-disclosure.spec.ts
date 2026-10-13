import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import { persistBookingPii } from "../../src/server/capabilities/booking-lifecycle/pii-repository";
import { createScheduledBooking } from "../../src/server/capabilities/booking-lifecycle/repository";

test("reveals one audited field privately without placing PII or reasons in the URL or browser storage", async ({ context, page }) => {
  const pool = createPool();
  try {
    const bookingId = await createPickupBooking(pool);
    const owner = await createActor(pool, "OWNER");
    await installSession(context, owner.session);
    const requestId = randomUUID();

    const response = await page.request.post(`/api/admin/bookings/${bookingId}/sensitive/CPF`, {
      data: { purpose: "BOOKING_OPERATION", reason: "Atendimento operacional solicitado pelo cliente." },
      headers: {
        origin: "http://localhost:3000",
        "x-csrf-token": owner.session.csrfToken,
        "idempotency-key": requestId,
      },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ field: "CPF", value: "12345678901" });
    expect(response.headers()["cache-control"]).toBe("private, no-store, max-age=0");
    expect(response.headers()["pragma"]).toBe("no-cache");
    expect(response.url()).not.toContain("12345678901");
    expect(response.url()).not.toContain("Atendimento");

    const retry = await page.request.post(`/api/admin/bookings/${bookingId}/sensitive/CPF`, {
      data: { purpose: "BOOKING_OPERATION", reason: "Atendimento operacional solicitado pelo cliente." },
      headers: { origin: "http://localhost:3000", "x-csrf-token": owner.session.csrfToken, "idempotency-key": requestId },
    });
    expect(retry.status()).toBe(200);
    expect(await retry.json()).toEqual({ field: "CPF", value: "12345678901" });

    await page.goto("/admin/bookings/11111111-1111-4111-8111-111111111111");
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
      .toEqual({ local: 0, session: 0 });
  } finally {
    await pool.end();
  }
});

test("enforces field eligibility, purpose validation, and CSRF without leaking inaccessible resources", async ({ context, page }) => {
  const pool = createPool();
  try {
    const bookingId = await createPickupBooking(pool);
    const employee = await createActor(pool, "EMPLOYEE");
    await installSession(context, employee.session);

    const deniedCpf = await reveal(page, bookingId, "CPF", employee.session.csrfToken);
    expect(deniedCpf.status()).toBe(403);
    expect(await deniedCpf.json()).toEqual({ kind: "SENSITIVE_FIELD_FORBIDDEN" });

    const address = await reveal(page, bookingId, "PICKUP_ADDRESS", employee.session.csrfToken);
    expect(address.status()).toBe(200);
    expect(await address.json()).toEqual({ field: "PICKUP_ADDRESS", value: "Rua das Flores, 10" });

    const noCsrf = await page.request.post(`/api/admin/bookings/${bookingId}/sensitive/PICKUP_ADDRESS`, {
      data: { purpose: "BOOKING_OPERATION", reason: "Atendimento operacional solicitado pelo cliente." },
      headers: { origin: "http://localhost:3000", "idempotency-key": randomUUID() },
    });
    expect(noCsrf.status()).toBe(403);

    const invalidPurpose = await page.request.post(`/api/admin/bookings/${bookingId}/sensitive/PICKUP_ADDRESS`, {
      data: { purpose: "CURIOSITY", reason: "Motivo sem finalidade operacional aprovada." },
      headers: { origin: "http://localhost:3000", "x-csrf-token": employee.session.csrfToken, "idempotency-key": randomUUID() },
    });
    expect(invalidPurpose.status()).toBe(422);
    expect(await invalidPurpose.json()).toEqual({ kind: "INVALID_REQUEST" });
  } finally {
    await pool.end();
  }
});

function reveal(page: Page, bookingId: string, field: "CPF" | "PICKUP_ADDRESS", csrfToken: string) {
  return page.request.post(`/api/admin/bookings/${bookingId}/sensitive/${field}`, {
    data: { purpose: "BOOKING_OPERATION", reason: "Atendimento operacional solicitado pelo cliente." },
    headers: { origin: "http://localhost:3000", "x-csrf-token": csrfToken, "idempotency-key": randomUUID() },
  });
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for sensitive disclosure browser verification.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 2 });
}

async function createActor(pool: Pool, role: "OWNER" | "EMPLOYEE") {
  const adminId = randomUUID();
  const issuer = `https://${randomUUID()}.example.test`;
  await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, $3, $4)", [adminId, issuer, adminId, role]);
  return { adminId, session: await createLocalSession(pool, { issuer, subject: adminId, mfaAssured: true }) };
}

async function installSession(context: BrowserContext, session: Awaited<ReturnType<typeof createLocalSession>>) {
  await context.addCookies([
    { name: "__Host-admin_session", value: session.cookieValue, url: "https://localhost:3000", secure: true, httpOnly: true, sameSite: "Lax" },
    { name: "__Host-admin_csrf", value: session.csrfToken, url: "https://localhost:3000", secure: true, httpOnly: false, sameSite: "Lax" },
  ]);
}

async function createPickupBooking(pool: Pool) {
  const packageId = randomUUID();
  await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
  await pool.query("insert into app.service_package_revisions values ($1, 1, 'Completo', 'Lavagem', 12500, 60, 'ACTIVE')", [packageId]);
  const booking = await createScheduledBooking(pool, { packageId, serviceStart: new Date("2026-09-02T12:00:00Z"), serviceMode: "PICKUP_REQUESTED", intendedPaymentMethod: "PIX" });
  await persistBookingPii(pool, { bookingId: booking.bookingId, fullName: "Ana", phoneWhatsapp: "5585999999999", email: undefined, cpf: "12345678901", vehicleModel: "Hatch", licencePlate: "ABC1D23", vehicleColor: "Prata", pickupAddress: "Rua das Flores, 10" });
  return booking.bookingId;
}
