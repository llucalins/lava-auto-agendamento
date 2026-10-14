import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import { getCalendarConfiguration } from "../../src/server/capabilities/admin-operations/calendar-management";
import { applyGuardedCalendar } from "../../src/server/capabilities/admin-operations/calendar-conflicts";

test("OWNER edits weekly hours and a date closure; public availability reflects saved rules", async ({ context, page }) => {
  const pool = createPool();
  const owner = await createOwner(pool);
  const initial = await getCalendarConfiguration(pool, owner.cookieValue);
  const packageId = await createPackage(pool);
  const date = uniqueSunday();
  const availableStart = `${date}T11:00:00.000Z`;
  const pauseStart = `${date}T15:00:00.000Z`;
  await addSessionCookies(context, owner);

  try {
    const response = await page.goto("/admin/calendar");
    expect(response?.status()).toBe(200);
    await page.getByLabel("Atendimentos simultâneos").fill("2");
    const sunday = page.locator(".calendar-day").first();
    await sunday.getByLabel("Abrir neste dia").check();
    await sunday.getByLabel("Abertura 1").fill("08:00");
    await sunday.getByLabel("Fechamento 1").fill("12:00");
    await sunday.getByRole("button", { name: "Adicionar faixa / pausa" }).click();
    await sunday.getByLabel("Abertura 2").fill("13:00");
    await sunday.getByLabel("Fechamento 2").fill("17:00");

    expect(await saveCalendar(page)).toBe(200);
    await expect(page.getByRole("status")).toContainText("Calendário salvo");
    await page.reload();
    await expect(page.getByLabel("Atendimentos simultâneos")).toHaveValue("2");
    await expect(page.locator(".calendar-day").first().getByLabel("Fechamento 1")).toHaveValue("12:00");

    await expect(await availability(page, packageId, availableStart)).toContain(availableStart);
    await expect(await availability(page, packageId, pauseStart)).toEqual([]);

    await sunday.getByLabel("Abrir neste dia").uncheck();
    expect(await saveCalendar(page)).toBe(200);
    await expect(await availability(page, packageId, availableStart)).toEqual([]);

    await sunday.getByLabel("Abrir neste dia").check();
    expect(await saveCalendar(page)).toBe(200);
    await expect(await availability(page, packageId, availableStart)).toContain(availableStart);

    await page.getByLabel("Data local da exceção").fill(date);
    await page.getByLabel("Regra para a data").selectOption("CLOSED");
    await page.getByRole("button", { name: "Adicionar exceção" }).click();
    expect(await saveCalendar(page)).toBe(200);
    await expect(await availability(page, packageId, availableStart)).toEqual([]);
    const removeHoliday = page.locator("li").filter({ hasText: date }).getByRole("button", { name: "Remover" });
    await removeHoliday.click();
    expect(await saveCalendar(page)).toBe(200);
    await expect(await availability(page, packageId, availableStart)).toContain(availableStart);

    await page.getByLabel("Data do bloqueio (America/Fortaleza)").fill(date);
    await page.getByLabel("Início do bloqueio").fill("08:00");
    await page.getByLabel("Fim do bloqueio").fill("09:00");
    await page.getByRole("button", { name: "Adicionar bloqueio" }).click();
    expect(await saveCalendar(page)).toBe(200);
    await expect(await availability(page, packageId, availableStart)).toEqual([]);
    await page.getByRole("button", { name: /Remover/ }).last().click();
    expect(await saveCalendar(page)).toBe(200);
    await expect(await availability(page, packageId, availableStart)).toContain(availableStart);
  } finally {
    const latest = await getCalendarConfiguration(pool, owner.cookieValue);
    await applyGuardedCalendar(pool, owner.cookieValue, {
      ...initial.configuration,
      expectedRevision: latest.configuration.expectedRevision,
    }, true);
    await pool.end();
  }
});

async function availability(page: Page, packageId: string, start: string): Promise<string[]> {
  const response = await page.request.get(`/api/public/availability?packageId=${packageId}&start=${encodeURIComponent(start)}`);
  expect(response.status()).toBe(200);
  const body = await response.json() as { availableStarts: { start: string }[] };
  return body.availableStarts.map((item) => item.start);
}

async function saveCalendar(page: Page): Promise<number> {
  let responsePromise = page.waitForResponse((candidate) => candidate.url().endsWith("/api/admin/calendar") && candidate.request().method() === "PUT");
  await page.getByRole("button", { name: "Revisar e salvar calendário" }).click();
  let response = await responsePromise;
  if (response.status() === 409) {
    await page.getByLabel("Reconheço os conflitos e quero aplicar sem mover ou cancelar agendamentos.").check();
    responsePromise = page.waitForResponse((candidate) => candidate.url().endsWith("/api/admin/calendar") && candidate.request().method() === "PUT");
    await page.getByRole("button", { name: "Aplicar alteração reconhecida" }).click();
    response = await responsePromise;
  }
  return response.status();
}

async function createPackage(pool: Pool): Promise<string> {
  const packageId = randomUUID();
  await pool.query("insert into app.service_packages (package_id, current_revision) values ($1, 1)", [packageId]);
  await pool.query("insert into app.service_package_revisions (package_id, revision, name, description, price_centavos, duration_minutes, state) values ($1, 1, 'Synthetic calendar E2E', null, 5000, 30, 'ACTIVE')", [packageId]);
  return packageId;
}

async function createOwner(pool: Pool) {
  const adminId = randomUUID();
  const issuer = `https://${randomUUID()}.calendar-operations.example.test`;
  await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, $3, 'OWNER')", [adminId, issuer, adminId]);
  return createLocalSession(pool, { issuer, subject: adminId, mfaAssured: true });
}

async function addSessionCookies(context: BrowserContext, session: Awaited<ReturnType<typeof createLocalSession>>) {
  await context.addCookies([
    { name: "__Host-admin_session", value: session.cookieValue, url: "https://localhost:3000", secure: true, httpOnly: true, sameSite: "Lax" },
    { name: "__Host-admin_csrf", value: session.csrfToken, url: "https://localhost:3000", secure: true, httpOnly: false, sameSite: "Lax" },
  ]);
}

function uniqueSunday(): string {
  const date = new Date("2070-01-01T00:00:00Z");
  while (date.getUTCDay() !== 0) date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCDate(date.getUTCDate() + (Number.parseInt(randomUUID().slice(0, 8), 16) % 1_500) * 7);
  return date.toISOString().slice(0, 10);
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for calendar browser verification.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 4 });
}
