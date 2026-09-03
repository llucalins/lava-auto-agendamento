import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";

import { expect, test } from "@playwright/test";
import { Pool } from "pg";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";

loadEnvFile(".env.local");

test("an OWNER creates and deactivates a package through the protected browser flow", async ({ context, page }) => {
  const pool = createPool();
  try {
    const packageName = `000 E2E ${randomUUID().slice(0, 8)}`;
    const session = await createActor(pool, "OWNER");
    await context.addCookies([
      { name: "__Host-admin_session", value: session.cookieValue, url: "https://localhost:3000", secure: true, httpOnly: true, sameSite: "Lax" },
      { name: "__Host-admin_csrf", value: session.csrfToken, url: "https://localhost:3000", secure: true, httpOnly: false, sameSite: "Lax" },
    ]);
    await page.setViewportSize({ width: 320, height: 800 });

    const response = await page.goto("/admin/packages");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Pacotes", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar pacote" })).toBeEnabled();

    await page.getByLabel("Nome do novo pacote").fill(packageName);
    await page.getByLabel("Descrição do novo pacote").fill("Lavagem completa sintética");
    await page.getByLabel("Preço em centavos do novo pacote").fill("12500");
    await page.getByLabel("Duração em minutos do novo pacote").fill("60");
    const createResponse = page.waitForResponse((candidate) => candidate.url().endsWith("/api/admin/packages") && candidate.request().method() === "POST");
    await page.getByRole("button", { name: "Criar pacote" }).click();
    expect((await createResponse).status()).toBe(201);
    await expect(page.getByRole("group", { name: `Editar ${packageName}` })).toBeVisible();

    const editor = page.getByRole("group", { name: `Editar ${packageName}` });
    await editor.getByLabel("Preço em centavos").fill("15000");
    await editor.getByLabel("Estado").selectOption("INACTIVE");
    const updateResponse = page.waitForResponse((candidate) => candidate.url().includes("/api/admin/packages/") && candidate.request().method() === "PATCH");
    await editor.getByRole("button", { name: "Salvar revisão" }).click();
    expect((await updateResponse).status()).toBe(200);
    await expect(editor.getByText("Revisão 2 · INACTIVE")).toBeVisible();

    const publicPackages = await page.request.get("/api/public/packages");
    expect(await publicPackages.json()).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: packageName })]));
  } finally {
    await pool.end();
  }
});

test("denies EMPLOYEE package administration and rejects mutation without CSRF", async ({ context, page }) => {
  const pool = createPool();
  try {
    const employeeSession = await createActor(pool, "EMPLOYEE");
    await context.addCookies([
      { name: "__Host-admin_session", value: employeeSession.cookieValue, url: "https://localhost:3000", secure: true, httpOnly: true, sameSite: "Lax" },
      { name: "__Host-admin_csrf", value: employeeSession.csrfToken, url: "https://localhost:3000", secure: true, httpOnly: false, sameSite: "Lax" },
    ]);
    const pageResponse = await page.goto("/admin/packages");
    expect(pageResponse?.status()).toBe(404);

    const mutation = await page.request.post("/api/admin/packages", {
      data: { name: "Negado", description: null, priceCentavos: 100, durationMinutes: 30, state: "ACTIVE" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(mutation.status()).toBe(403);
    expect(await mutation.json()).toEqual({ kind: "FORBIDDEN" });
  } finally {
    await pool.end();
  }
});

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for admin package browser verification.");
  return new Pool({ allowExitOnIdle: true, connectionString, max: 2 });
}

async function createActor(pool: Pool, role: "OWNER" | "EMPLOYEE") {
  const adminId = randomUUID();
  const issuer = `https://${randomUUID()}.example.test`;
  await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, $3, $4)", [adminId, issuer, adminId, role]);
  return createLocalSession(pool, { issuer, subject: adminId, mfaAssured: true });
}
