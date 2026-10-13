import { randomUUID } from "node:crypto";

import { expect, test, type Page, type Route } from "@playwright/test";
import { Pool } from "pg";

type Fixture = Readonly<{ pool: Pool; packageId: string; packageName: string; dayOffset: number; start: Date }>;
type Review = Readonly<{ kind: string; package: Readonly<{ id: string; revision: number; priceCentavos: string; durationMinutes: number }>; calendarRevision: number; start: string; end: string; reviewToken: string }>;
type ConfirmationBody = Readonly<{ intentKey: string; material: Record<string, unknown> }>;

test("real browser confirmation serializes duplicate submissions to one booking and allocation", async ({ page }) => {
  const fixture = await createFixture();
  try {
    const review = await reachReview(page, fixture);
    expect(review.package.priceCentavos).toBe("7500");

    let arrivals = 0;
    let releaseArrivals!: () => void;
    const bothArrived = new Promise<void>((resolve) => { releaseArrivals = resolve; });
    let resolveFirstBody!: (body: ConfirmationBody) => void;
    const firstBody = new Promise<ConfirmationBody>((resolve) => { resolveFirstBody = resolve; });
    const interceptedBodies: ConfirmationBody[] = [];
    await page.route("**/api/public/bookings", async (route) => {
      const body = route.request().postDataJSON() as ConfirmationBody;
      interceptedBodies.push(body);
      arrivals += 1;
      if (arrivals === 1) resolveFirstBody(body);
      if (arrivals === 2) releaseArrivals();
      await bothArrived;
      await route.continue();
    });

    const firstResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/public/bookings") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();
    const body = await firstBody;
    const duplicatePromise = page.evaluate(async (payload) => {
      const response = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: await response.json() as { kind: string; bookingId: string; replayed: boolean } };
    }, body);

    const firstResponse = await firstResponsePromise;
    const firstResult = await firstResponse.json() as { kind: string; bookingId: string; replayed: boolean };
    const duplicateResult = await duplicatePromise;
    expect(interceptedBodies[1]).toEqual(interceptedBodies[0]);
    expect(firstResponse.status()).toBe(200);
    expect(duplicateResult.status).toBe(200);
    await expectBookingCounts(fixture.pool, fixture.packageId, body.intentKey, { bookings: "1", allocations: "1", intents: "1" });
    expect(firstResult.kind).toBe("CONFIRMED");
    expect(duplicateResult.body.kind).toBe("CONFIRMED");
    await expect(page.getByRole("status")).toContainText("Agendamento confirmado");
  } finally {
    await fixture.pool.end();
  }
});

test("retries the same intent after the real confirmation response is lost after commit", async ({ page }) => {
  const fixture = await createFixture();
  try {
    await reachReview(page, fixture);
    const bodies: ConfirmationBody[] = [];
    let firstCommittedResult: { kind: string; bookingId: string; replayed: boolean } | undefined;
    await page.route("**/api/public/bookings", async (route: Route) => {
      bodies.push(route.request().postDataJSON() as ConfirmationBody);
      if (bodies.length === 1) {
        const actualResponse = await route.fetch();
        firstCommittedResult = await actualResponse.json() as typeof firstCommittedResult;
        expect(actualResponse.status()).toBe(200);
        expect(firstCommittedResult?.kind).toBe("CONFIRMED");
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "Confirmar agendamento" }).click();
    await expect(page.locator(".review-step [role='alert']")).toContainText("Não foi possível confirmar agora");
    const retryResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/public/bookings") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();
    await expect(page.getByRole("status")).toContainText("Agendamento confirmado");
    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.intentKey).toBe(bodies[0]?.intentKey);
    expect(bodies[1]?.material).toEqual(bodies[0]?.material);
    expect(firstCommittedResult?.replayed).toBe(false);
    const retryResponse = await retryResponsePromise;
    const retryResult = await retryResponse.json() as { kind: string; replayed: boolean };
    expect(retryResult).toEqual({ kind: "CONFIRMED", replayed: true });
    await expectBookingCounts(fixture.pool, fixture.packageId, bodies[0]!.intentKey, { bookings: "1", allocations: "1", intents: "1" });
  } finally {
    await fixture.pool.end();
  }
});

test("rejects the reviewed terms when package price and revision change before confirmation", async ({ page }) => {
  const fixture = await createFixture();
  try {
    const review = await reachReview(page, fixture);
    expect(review.package).toMatchObject({ revision: 1, priceCentavos: "7500" });
    await fixture.pool.query(
      "insert into app.service_package_revisions (package_id, revision, name, description, price_centavos, duration_minutes, state) values ($1, 2, 'Synthetic revised package', null, 9900, 45, 'ACTIVE')",
      [fixture.packageId],
    );
    await fixture.pool.query("update app.service_packages set current_revision = 2 where package_id = $1", [fixture.packageId]);

    const confirmation = page.waitForResponse((response) =>
      response.url().endsWith("/api/public/bookings") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();
    const response = await confirmation;
    expect(response.status()).toBe(200);
    const result = await response.json() as { kind: string; code: string };
    expect(result).toEqual({ kind: "REJECTED", code: "STALE_PACKAGE", replayed: false });
    const intentKey = (response.request().postDataJSON() as ConfirmationBody).intentKey;
    await expect(page.locator(".review-step [role='alert']")).toContainText("não está mais disponível");
    await expectBookingCounts(fixture.pool, fixture.packageId, intentKey, { bookings: "0", allocations: "0", intents: "1" }, "STALE_PACKAGE");
  } finally {
    await fixture.pool.end();
  }
});

test("rejects the reviewed start when the calendar becomes unavailable before confirmation", async ({ page }) => {
  const fixture = await createFixture();
  const migrationPool = createMigrationPool();
  const unavailabilityId = randomUUID();
  try {
    const review = await reachReview(page, fixture);
    await fixture.pool.query(
      "insert into app.calendar_unavailability (unavailability_id, starts_at, ends_at, revision) values ($1, $2, $3, $4)",
      [unavailabilityId, review.start, review.end, review.calendarRevision],
    );

    const confirmation = page.waitForResponse((response) =>
      response.url().endsWith("/api/public/bookings") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();
    const response = await confirmation;
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ kind: "REJECTED", code: "STALE_CALENDAR", replayed: false });
    const intentKey = (response.request().postDataJSON() as ConfirmationBody).intentKey;
    await expect(page.locator(".review-step [role='alert']")).toContainText("não está mais disponível");
    await expectBookingCounts(fixture.pool, fixture.packageId, intentKey, { bookings: "0", allocations: "0", intents: "1" }, "STALE_CALENDAR");
  } finally {
    await migrationPool.query("delete from app.calendar_unavailability where unavailability_id = $1", [unavailabilityId]).catch(() => undefined);
    await migrationPool.end();
    await fixture.pool.end();
  }
});

async function reachReview(page: Page, fixture: Fixture): Promise<Review> {
  await page.goto("/booking");
  const packagesResponse = await page.waitForResponse((response) => response.url().endsWith("/api/public/packages"));
  expect(packagesResponse.status()).toBe(200);
  await page.getByRole("button").filter({ hasText: fixture.packageName }).click();

  const availabilityResponse = page.waitForResponse((response) => response.url().includes("/api/public/availability?"));
  await page.locator(".day-list button").nth(fixture.dayOffset).click();
  const available = await availabilityResponse;
  expect(available.status()).toBe(200);
  const availableStarts = (await available.json() as { availableStarts: Array<{ start: string }> }).availableStarts;
  expect(availableStarts.some((item) => item.start === fixture.start.toISOString())).toBe(true);
  const timeLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" }).format(fixture.start);
  await page.getByRole("button", { name: timeLabel, exact: true }).click();

  await page.getByLabel("Nome completo").fill("Cliente E2E Sintético");
  await page.getByLabel("Telefone/WhatsApp").fill("85999991111");
  await page.getByLabel("CPF").fill("12345678909");
  await page.getByRole("button", { name: "Continuar" }).first().click();
  await page.getByLabel("Modelo").fill("Hatch sintético");
  await page.getByLabel("Placa").fill(`TST${randomUUID().slice(0, 4)}`);
  await page.getByLabel("Cor").fill("Prata");
  await page.getByRole("button", { name: "Continuar" }).last().click();
  await page.getByRole("button", { name: "Continuar" }).last().click();
  await page.getByLabel("PIX").check();
  const reviewResponse = page.waitForResponse((response) => response.url().endsWith("/api/public/bookings/review"));
  await page.getByRole("button", { name: "Continuar" }).last().click();
  const response = await reviewResponse;
  expect(response.status()).toBe(200);
  const review = await response.json() as Review;
  expect(review.kind).toBe("READY");
  expect(review.package.id).toBe(fixture.packageId);
  await expect(page.getByRole("heading", { name: "Revise seu agendamento" })).toBeVisible();
  return review;
}

async function createFixture(): Promise<Fixture> {
  const pool = createPool();
  const packageId = randomUUID();
  const packageName = `Synthetic E2E ${randomUUID().slice(0, 8)}`;
  await pool.query("insert into app.operating_calendar default values on conflict do nothing");
  await pool.query("insert into app.service_packages (package_id, current_revision) values ($1, 1)", [packageId]);
  await pool.query(
    "insert into app.service_package_revisions (package_id, revision, name, description, price_centavos, duration_minutes, state) values ($1, 1, $2, 'Synthetic browser fixture', 7500, 30, 'ACTIVE')",
    [packageId, packageName],
  );
  const slot = await ensureSelectableDay(pool);
  return { pool, packageId, packageName, ...slot };
}

async function ensureSelectableDay(pool: Pool): Promise<Readonly<{ dayOffset: number; start: Date }>> {
  const calendar = await pool.query<{ revision: number }>("select revision from app.operating_calendar where calendar_id = true");
  const revision = calendar.rows[0]?.revision;
  if (!revision) throw new Error("The synthetic browser fixture requires the operating calendar.");

  for (let dayOffset = 1; dayOffset < 14; dayOffset += 1) {
    const dateKey = dateInFortaleza(dayOffset);
    const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
    const override = await pool.query<{ startsAt: string | null; endsAt: string | null; isClosed: boolean }>(
      "select starts_at::text as \"startsAt\", ends_at::text as \"endsAt\", is_closed as \"isClosed\" from app.calendar_overrides where calendar_date = $1 and revision = $2",
      [dateKey, revision],
    );
    let windows = override.rows;
    if (windows.length === 0) {
      const recurring = await pool.query<{ startsAt: string; endsAt: string; isClosed: boolean }>(
        "select starts_at::text as \"startsAt\", ends_at::text as \"endsAt\", false as \"isClosed\" from app.calendar_recurring_windows where weekday = $1 and revision = $2 order by starts_at",
        [weekday, revision],
      );
      windows = recurring.rows;
      if (windows.length === 0) {
        await pool.query(
          "insert into app.calendar_recurring_windows (weekday, starts_at, ends_at, revision) values ($1, '08:00', '12:00', $2) on conflict do nothing",
          [weekday, revision],
        );
        windows = [{ startsAt: "08:00:00", endsAt: "12:00:00", isClosed: false }];
      }
    }

    for (const window of windows) {
      if (window.isClosed || !window.startsAt || !window.endsAt) continue;
      const startMinute = Math.max(8 * 60, timeMinutes(window.startsAt));
      const endMinute = Math.min(18 * 60, timeMinutes(window.endsAt) - 30);
      for (let minute = Math.ceil(startMinute / 30) * 30; minute <= endMinute; minute += 30) {
        const start = fortalezaInstant(dateKey, minute);
        const end = new Date(start.getTime() + 30 * 60_000);
        const conflicts = await pool.query(
          "select 1 from app.calendar_unavailability where revision = $1 and starts_at < $3 and ends_at > $2 limit 1",
          [revision, start, end],
        );
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
        if (conflicts.rowCount === 0 && occupied.rowCount === 0) return { dayOffset, start };
      }
    }
  }
  throw new Error("No selectable synthetic slot exists in the next 13 days.");
}

async function expectBookingCounts(
  pool: Pool,
  packageId: string,
  intentKey: string,
  expected: Readonly<{ bookings: string; allocations: string; intents: string }>,
  outcomeCode?: string,
) {
  const state = await pool.query<{ bookings: string; allocations: string; intents: string; outcomeCode: string | null }>(
    `select
       (select count(*)::text from app.bookings where package_id = $1) as bookings,
       (select count(*)::text from app.capacity_allocations allocation join app.bookings booking using (booking_id) where booking.package_id = $1) as allocations,
       (select count(*)::text from app.confirmation_intents where intent_key = $2) as intents,
       (select outcome_code from app.confirmation_intents where intent_key = $2 limit 1) as "outcomeCode"`,
    [packageId, intentKey],
  );
  expect(state.rows[0]).toMatchObject({ ...expected, ...(outcomeCode ? { outcomeCode } : {}) });
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for public booking browser verification.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 4 });
}

function createMigrationPool(): Pool {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required for synthetic calendar fixture cleanup.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 1 });
}

function dateInFortaleza(offset: number): string {
  const localToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
  const [year, month, day] = localToday.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + offset, 12));
  return date.toISOString().slice(0, 10);
}

function fortalezaInstant(dateKey: string, minutesAfterMidnight: number): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!, Math.floor(minutesAfterMidnight / 60) + 3, minutesAfterMidnight % 60));
}

function timeMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours! * 60 + minutes!;
}
