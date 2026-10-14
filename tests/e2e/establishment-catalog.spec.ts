import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext } from "@playwright/test";
import { Pool } from "pg";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";

test("OWNER updates establishment and service; persisted values appear in the public site", async ({ context, page }) => {
  const pool = createPool();
  try {
    const suffix = randomUUID().slice(0, 8);
    const packageName = `! E2E Slice A ${suffix}`;
    const businessName = `Lava Auto Synthetic ${suffix}`;
    const session = await createActor(pool, "OWNER");
    await addSessionCookies(context, session);

    const pageResponse = await page.goto("/admin/establishment");
    expect(pageResponse?.status()).toBe(200);
    await page.getByLabel("Nome comercial").fill(businessName);
    await page.getByLabel("WhatsApp").fill("+5585999990000");
    await page.getByLabel("Endereço público").fill(`Rua de Teste, ${suffix}, Fortaleza - CE`);
    const profileResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/establishment") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvar configuração" }).click();
    expect((await profileResponse).status()).toBe(200);
    await expect(page.getByRole("status")).toContainText("Configuração salva");

    const persistedProfile = await pool.query(
      "select trade_name as \"tradeName\", whatsapp, address from app.establishment_profile where establishment_id = '00000000-0000-4000-8000-000000000001'",
    );
    expect(persistedProfile.rows[0]).toMatchObject({ tradeName: businessName, whatsapp: "+5585999990000" });
    const publicProfile = await page.request.get("/api/public/establishment");
    expect((await publicProfile.json()).profile).toMatchObject({ tradeName: businessName, whatsapp: "+5585999990000" });

    await page.goto("/admin/packages");
    await page.getByLabel("Nome do novo pacote").fill(packageName);
    await page.getByLabel("Preço em centavos do novo pacote").fill("12500");
    await page.getByLabel("Duração em minutos do novo pacote").fill("60");
    const createResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/packages") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Criar pacote" }).click();
    expect((await createResponse).status()).toBe(201);
    const editor = page.getByRole("group", { name: `Editar ${packageName}` });
    await expect(editor).toBeVisible();

    await editor.getByLabel("Preço em centavos").fill("15000");
    const updateResponse = page.waitForResponse((response) => response.url().includes("/api/admin/packages/") && response.request().method() === "PATCH");
    await editor.getByRole("button", { name: "Salvar revisão" }).click();
    expect((await updateResponse).status()).toBe(200);
    await expect(editor.getByText("Revisão 2 · ACTIVE")).toBeVisible();

    const persistedService = await pool.query(
      `select revision.name, revision.price_centavos::text as "priceCentavos", revision.duration_minutes as "durationMinutes"
       from app.service_packages package join app.service_package_revisions revision
         on revision.package_id = package.package_id and revision.revision = package.current_revision
       where revision.name = $1`,
      [packageName],
    );
    expect(persistedService.rows[0]).toMatchObject({ name: packageName, priceCentavos: "15000", durationMinutes: 60 });

    await page.goto("/");
    const publicService = page.getByRole("article").filter({ has: page.getByRole("heading", { name: packageName }) });
    await expect(publicService).toBeVisible();
    await expect(publicService.getByText(/150,00/)).toBeVisible();
    await expect(page.getByText(businessName)).toBeVisible();
  } finally {
    await pool.end();
  }
});

test("EMPLOYEE cannot open or read establishment configuration", async ({ context, page }) => {
  const pool = createPool();
  try {
    const session = await createActor(pool, "EMPLOYEE");
    await addSessionCookies(context, session);
    const pageResponse = await page.goto("/admin/establishment");
    expect(pageResponse?.status()).toBe(404);
    const response = await page.request.get("/api/admin/establishment");
    expect(response.status()).toBe(403);
  } finally {
    await pool.end();
  }
});

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for establishment browser verification.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 2 });
}

async function createActor(pool: Pool, role: "OWNER" | "EMPLOYEE") {
  const adminId = randomUUID();
  const issuer = `https://${randomUUID()}.example.test`;
  await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, $3, $4)", [adminId, issuer, adminId, role]);
  return createLocalSession(pool, { issuer, subject: adminId, mfaAssured: true });
}

async function addSessionCookies(context: BrowserContext, session: Awaited<ReturnType<typeof createActor>>) {
  await context.addCookies([
    { name: "__Host-admin_session", value: session.cookieValue, url: "https://localhost:3000", secure: true, httpOnly: true, sameSite: "Lax" },
    { name: "__Host-admin_csrf", value: session.csrfToken, url: "https://localhost:3000", secure: true, httpOnly: false, sameSite: "Lax" },
  ]);
}
