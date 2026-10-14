import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import { createAdminPromotion, listAdminPromotions, reviseAdminPromotion } from "../../src/server/capabilities/promotions/management";
import { calculatePricesForStarts } from "../../src/server/capabilities/promotions/pricing";
import { reviseAdminPackage } from "../../src/server/capabilities/admin-operations/package-management";
import { createConcurrentIntegrationPool } from "../support/postgres";

describe("PostgreSQL promotions", () => {
  const pools: Pool[] = [];
  afterEach(async () => { await Promise.all(pools.splice(0).map((pool) => pool.end())); });

  it("persists authorized terms, calculates a local-time quote, and rejects overlapping offers", async () => {
    const owner = await createActor("OWNER");
    const packageId = await createPackage(owner.pool, 101);
    const terms = {
      name: "Segunda sintética",
      discountKind: "PERCENTAGE",
      discountValue: 50,
      packageIds: [packageId],
      state: "ACTIVE",
      validFrom: "2080-01-01",
      validThrough: "2080-01-31",
      weekdays: [2],
      startsAt: "09:00",
      endsAt: "12:00",
    } as const;
    const created = await createAdminPromotion(owner.pool, owner.sessionCookie, terms);
    expect(created).toMatchObject({ revision: 1, state: "ACTIVE" });

    const listed = await listAdminPromotions(owner.pool, owner.sessionCookie);
    expect(listed.find((promotion) => promotion.promotionId === created.promotionId)).toMatchObject({
      revision: 1, discountValue: 50, packageIds: [packageId],
    });

    const localTuesdayAtTen = new Date("2080-01-02T13:00:00.000Z");
    const price = await calculatePricesForStarts(owner.pool, packageId, [localTuesdayAtTen]);
    expect(price.get(localTuesdayAtTen.toISOString())).toMatchObject({
      basePriceCentavos: "101", discountCentavos: "51", finalPriceCentavos: "50",
      promotion: { id: created.promotionId, revision: 1, name: terms.name },
    });
    const outsideWindow = await calculatePricesForStarts(owner.pool, packageId, [
      new Date("2080-01-02T15:00:00.000Z"), new Date("2080-01-03T13:00:00.000Z"),
    ]);
    expect([...outsideWindow.values()].every((quote) => quote.promotion === null && quote.discountCentavos === "0")).toBe(true);

    await expect(createAdminPromotion(owner.pool, owner.sessionCookie, {
      ...terms, name: "Conflitante", weekdays: [2], startsAt: "11:00", endsAt: "13:00",
    })).rejects.toThrow("Promotion conflicts with an active promotion");
    await expect(createAdminPromotion(owner.pool, owner.sessionCookie, {
      ...terms, name: "Outro dia", weekdays: [3],
    })).resolves.toMatchObject({ state: "ACTIVE" });

  });

  it("uses optimistic revisions, deactivation removes the quote, and non-owner writes fail", async () => {
    const owner = await createActor("OWNER");
    const employee = await createActor("EMPLOYEE");
    const packageId = await createPackage(owner.pool, 10_000);
    const created = await createAdminPromotion(owner.pool, owner.sessionCookie, {
      name: "Oferta fixa", discountKind: "FIXED", discountValue: 2_500,
      packageIds: [packageId], state: "ACTIVE", validFrom: "2080-01-01", validThrough: "2080-12-31",
    });
    await expect(reviseAdminPackage(owner.pool, owner.sessionCookie, {
      packageId, expectedRevision: 1, name: "Preço incompatível", description: null,
      priceCentavos: 2_000, durationMinutes: 30, state: "ACTIVE",
    })).rejects.toThrow("Active fixed promotion exceeds new service price");
    const command = {
      promotionId: created.promotionId, expectedRevision: 1, name: "Oferta fixa editada",
      discountKind: "FIXED", discountValue: 2_500, packageIds: [packageId], state: "INACTIVE",
      validFrom: "2080-01-01", validThrough: "2080-12-31",
    } as const;
    await expect(reviseAdminPromotion(owner.pool, owner.sessionCookie, command)).resolves.toMatchObject({ revision: 2, state: "INACTIVE" });
    await expect(reviseAdminPromotion(owner.pool, owner.sessionCookie, command)).rejects.toThrow("Stale promotion revision");
    await expect(createAdminPromotion(employee.pool, employee.sessionCookie, {
      name: "Não autorizado", discountKind: "FIXED", discountValue: 100,
      packageIds: [packageId], state: "ACTIVE", validFrom: "2080-01-01", validThrough: "2080-12-31",
    })).rejects.toThrow("Forbidden");

    const start = new Date("2080-01-02T13:00:00.000Z");
    const price = await calculatePricesForStarts(owner.pool, packageId, [start]);
    expect(price.get(start.toISOString())).toMatchObject({ discountCentavos: "0", finalPriceCentavos: "10000", promotion: null });
  });

  it("serializes concurrent activation so overlapping promotions cannot both become active", async () => {
    const owner = await createActor("OWNER");
    const packageId = await createPackage(owner.pool, 10_000);
    const terms = {
      discountKind: "PERCENTAGE" as const, discountValue: 10, packageIds: [packageId], state: "ACTIVE" as const,
      validFrom: "2090-01-01", validThrough: "2090-12-31",
    };
    const attempts = await Promise.allSettled([
      createAdminPromotion(owner.pool, owner.sessionCookie, { ...terms, name: "Concorrente A" }),
      createAdminPromotion(owner.pool, owner.sessionCookie, { ...terms, name: "Concorrente B" }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    const active = await owner.pool.query<{ count: string }>(
      `select count(*)::text as count from app.promotions promotion
       join app.promotion_services service using (promotion_id)
       where service.package_id = $1 and promotion.state = 'ACTIVE'
         and promotion.valid_from = '2090-01-01' and promotion.valid_through = '2090-12-31'`,
      [packageId],
    );
    expect(active.rows[0]?.count).toBe("1");
  });

  async function createActor(role: "OWNER" | "EMPLOYEE") {
    const pool = createConcurrentIntegrationPool();
    pools.push(pool);
    const adminId = randomUUID();
    const issuer = `https://${randomUUID()}.example.test`;
    await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, $3, $4)", [adminId, issuer, adminId, role]);
    const session = await createLocalSession(pool, { issuer, subject: adminId, mfaAssured: true });
    return { pool, sessionCookie: session.cookieValue };
  }

  async function createPackage(pool: Pool, priceCentavos: number) {
    await pool.query("insert into app.operating_calendar default values on conflict do nothing");
    const packageId = randomUUID();
    await pool.query("insert into app.service_packages (package_id, current_revision) values ($1, 1)", [packageId]);
    await pool.query("insert into app.service_package_revisions (package_id, revision, name, description, price_centavos, duration_minutes, state) values ($1, 1, 'Synthetic service', null, $2, 30, 'ACTIVE')", [packageId, priceCentavos]);
    return packageId;
  }
});
