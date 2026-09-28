import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext } from "@playwright/test";
import { Pool } from "pg";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import { replaceCalendar } from "../../src/server/capabilities/admin-operations/calendar-management";
import { createScheduledBooking } from "../../src/server/capabilities/booking-lifecycle/repository";

test.describe("before client hydration", () => {
  test.use({ javaScriptEnabled: false });

  test("keeps calendar controls disabled until client hydration", async ({ context, page }) => {
    const pool = createPool();
    try {
      const owner = await createActor(pool, "OWNER");
      await addSessionCookies(context, owner);

      expect((await page.goto("/admin/calendar"))?.status()).toBe(200);
      await expect(page.getByLabel("Data local em America/Fortaleza")).toBeDisabled();
      await expect(page.getByRole("button", { name: "Revisar e aplicar fechamento" })).toBeDisabled();
    } finally {
      await pool.end();
    }
  });
});

test("an OWNER reviews and explicitly acknowledges a calendar conflict without changing the booking", async ({ context, page }) => {
  const pool = createPool();
  try {
    const owner = await createActor(pool, "OWNER");
    await addSessionCookies(context, owner);
    const opened = await replaceCalendar(pool, owner.cookieValue, openConfiguration(await currentRevision(pool)));
    const packageId = await createPackage(pool);
    const date = uniqueDate();
    const booking = await createScheduledBooking(pool, {
      packageId,
      serviceStart: new Date(`${date}T12:00:00Z`),
      serviceMode: "DROP_OFF",
      intendedPaymentMethod: "PIX",
    });
    await page.setViewportSize({ width: 320, height: 800 });

    const response = await page.goto("/admin/calendar");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Calendário operacional" })).toBeVisible();
    await expect(page.getByText(`Revisão ${opened.revision}`)).toBeVisible();
    await page.getByLabel("Data local em America/Fortaleza").fill(date);

    const previewResponse = page.waitForResponse((candidate) => candidate.url().endsWith("/api/admin/calendar") && candidate.request().method() === "PUT");
    await page.getByRole("button", { name: "Revisar e aplicar fechamento" }).click();
    expect((await previewResponse).status()).toBe(409);
    await expect(page.locator(".conflict-panel")).toContainText(booking.bookingId);
    expect(await currentRevision(pool)).toBe(opened.revision);

    await page.getByLabel("Reconheço os conflitos e quero aplicar sem mover ou cancelar agendamentos.").check();
    const applyResponse = page.waitForResponse((candidate) => candidate.url().endsWith("/api/admin/calendar") && candidate.request().method() === "PUT");
    await page.getByRole("button", { name: "Aplicar fechamento reconhecido" }).click();
    expect((await applyResponse).status()).toBe(200);
    await expect(page.getByRole("status")).toContainText("agendamentos existentes foram preservados");

    const unchanged = await pool.query("select revision, status from app.bookings where booking_id = $1", [booking.bookingId]);
    expect(unchanged.rows).toEqual([{ revision: 1, status: "SCHEDULED" }]);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    expect(page.url()).not.toContain(booking.bookingId);
  } finally {
    await pool.end();
  }
});

test("denies EMPLOYEE calendar access and mutation without CSRF", async ({ context, page }) => {
  const pool = createPool();
  try {
    const employee = await createActor(pool, "EMPLOYEE");
    await addSessionCookies(context, employee);
    expect((await page.goto("/admin/calendar"))?.status()).toBe(404);
    const mutation = await page.request.put("/api/admin/calendar", {
      data: { configuration: openConfiguration(1), acknowledgeConflicts: false },
      headers: { origin: "http://localhost:3000" },
    });
    expect(mutation.status()).toBe(403);
    expect(await mutation.json()).toEqual({ kind: "FORBIDDEN" });
  } finally {
    await pool.end();
  }
});

function openConfiguration(expectedRevision: number) {
  return {
    expectedRevision,
    weeklySchedule: Array.from({ length: 7 }, (_, weekday) => ({ weekday, windows: [{ start: "00:00", end: "23:59" }] })),
    overrides: [],
    unavailability: [],
  };
}

async function currentRevision(pool: Pool): Promise<number> {
  await pool.query("insert into app.operating_calendar default values on conflict do nothing");
  const result = await pool.query<{ revision: number }>("select revision from app.operating_calendar where calendar_id = true");
  return result.rows[0]!.revision;
}

async function createPackage(pool: Pool): Promise<string> {
  const packageId = randomUUID();
  await pool.query("insert into app.service_packages (package_id, current_revision) values ($1, 1)", [packageId]);
  await pool.query("insert into app.service_package_revisions (package_id, revision, name, description, price_centavos, duration_minutes, state) values ($1, 1, 'Browser conflict', null, 0, 30, 'ACTIVE')", [packageId]);
  return packageId;
}

async function createActor(pool: Pool, role: "OWNER" | "EMPLOYEE") {
  const adminId = randomUUID();
  const issuer = `https://${randomUUID()}.calendar-browser.example.test`;
  await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, $3, $4)", [adminId, issuer, adminId, role]);
  return createLocalSession(pool, { issuer, subject: adminId, mfaAssured: true });
}

async function addSessionCookies(context: BrowserContext, session: Awaited<ReturnType<typeof createLocalSession>>) {
  await context.addCookies([
    { name: "__Host-admin_session", value: session.cookieValue, url: "https://localhost:3000", secure: true, httpOnly: true, sameSite: "Lax" },
    { name: "__Host-admin_csrf", value: session.csrfToken, url: "https://localhost:3000", secure: true, httpOnly: false, sameSite: "Lax" },
  ]);
}

function uniqueDate(): string {
  const date = new Date("2070-01-01T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + (Number.parseInt(randomUUID().slice(0, 8), 16) % 5_000));
  return date.toISOString().slice(0, 10);
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for calendar browser verification.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 4 });
}
