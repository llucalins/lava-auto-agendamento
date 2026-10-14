import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { confirmBooking } from "../../src/server/capabilities/booking-lifecycle/confirm";
import { createBookingReview } from "../../src/server/capabilities/public-booking-flow/review";
import { acquireCalendarConfirmationLock } from "../../src/server/capabilities/operating-calendar/coordination";
import { withTransaction } from "../../src/server/persistence/transaction";
import { createIntegrationPool } from "../support/postgres";

const fingerprintKey = "test-only-confirmation-fingerprint-key";

describe("promotional booking terms", () => {
  it("confirms the reviewed server quote and preserves its immutable snapshot after promotion edits", async () => {
    const pool = createIntegrationPool();
    const start = nextSundayStart();
    const packageId = await setupService(pool, start);
    const promotionId = await setupPromotion(pool, packageId, start);
    const review = await createBookingReview(pool, { packageId, serviceStart: start }, fingerprintKey);
    if (review.kind !== "READY") throw new Error("Expected a selectable synthetic service.");
    expect(review.price).toMatchObject({ basePriceCentavos: "12500", discountCentavos: "1000", finalPriceCentavos: "11500" });

    try {
      const result = await confirmBooking(pool, confirmation(review.reviewToken, packageId, start));
      expect(result.kind).toBe("CONFIRMED");
      if (result.kind !== "CONFIRMED") throw new Error("Expected confirmation.");

      const beforeEdit = await pool.query(
        `select price_centavos::text as base, promotion_id as "promotionId", promotion_revision as "promotionRevision",
                promotion_name as "promotionName", discount_centavos::text as discount,
                final_price_centavos::text as final
         from app.booking_package_snapshots where booking_id = $1`,
        [result.bookingId],
      );
      expect(beforeEdit.rows).toEqual([{
        base: "12500", promotionId, promotionRevision: 1, promotionName: "Oferta sintética",
        discount: "1000", final: "11500",
      }]);

      await pool.query("update app.promotions set revision = 2, discount_value = 2_000 where promotion_id = $1", [promotionId]);
      const afterEdit = await pool.query(
        "select promotion_revision, discount_centavos::text as discount, final_price_centavos::text as final from app.booking_package_snapshots where booking_id = $1",
        [result.bookingId],
      );
      expect(afterEdit.rows).toEqual([{ promotion_revision: 1, discount: "1000", final: "11500" }]);
    } finally {
      await pool.end();
    }
  });

  it("rejects confirmation if the promotion changes after the signed review", async () => {
    const pool = createIntegrationPool();
    const start = nextSundayStart();
    const packageId = await setupService(pool, start);
    const promotionId = await setupPromotion(pool, packageId, start);
    const review = await createBookingReview(pool, { packageId, serviceStart: start }, fingerprintKey);
    if (review.kind !== "READY") throw new Error("Expected a selectable synthetic service.");
    const request = confirmation(review.reviewToken, packageId, start);

    try {
      await pool.query("update app.promotions set revision = 2, discount_value = 2_000 where promotion_id = $1", [promotionId]);
      await expect(confirmBooking(pool, request)).resolves.toEqual({ kind: "REJECTED", code: "STALE_PROMOTION", replayed: false });
      await expect(pool.query("select count(*)::text as count from app.bookings where package_id = $1", [packageId]))
        .resolves.toMatchObject({ rows: [{ count: "0" }] });
    } finally {
      await pool.end();
    }
  });
});

async function setupService(pool: ReturnType<typeof createIntegrationPool>, start: Date): Promise<string> {
  await pool.query("insert into app.operating_calendar default values on conflict do nothing");
  await withTransaction(pool, async (client) => {
    await acquireCalendarConfirmationLock(client, "MUTATION");
    const calendar = await client.query<{ revision: number }>("select revision from app.operating_calendar where calendar_id = true");
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(start);
    await client.query(
      `insert into app.calendar_overrides (override_id, calendar_date, starts_at, ends_at, is_closed, revision)
       values ($1, $2, '08:00', '12:00', false, $3)`,
      [randomUUID(), localDate, calendar.rows[0]!.revision],
    );
  });
  const packageId = randomUUID();
  await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
  await pool.query("insert into app.service_package_revisions values ($1, 1, 'Synthetic promotional service', null, 12500, 30, 'ACTIVE')", [packageId]);
  return packageId;
}

async function setupPromotion(pool: ReturnType<typeof createIntegrationPool>, packageId: string, start: Date): Promise<string> {
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(start);
  const promotionId = randomUUID();
  await pool.query(
    `insert into app.promotions (promotion_id, revision, name, discount_kind, discount_value, state, valid_from, valid_through)
     values ($1, 1, 'Oferta sintética', 'FIXED', 1000, 'ACTIVE', $2, $2)`,
    [promotionId, localDate],
  );
  await pool.query("insert into app.promotion_services (promotion_id, package_id) values ($1, $2)", [promotionId, packageId]);
  return promotionId;
}

function confirmation(reviewToken: string, packageId: string, start: Date) {
  return {
    intentKey: `intent-key-${randomUUID().replaceAll("-", "")}`,
    fingerprintKey,
    expiresAt: new Date(Date.now() + 86_400_000),
    material: {
      packageId, serviceStart: start, serviceMode: "DROP_OFF" as const,
      intendedPaymentMethod: "PIX" as const, fullName: "Cliente Sintético",
      phoneWhatsapp: "85999990000", email: "cliente@example.test", cpf: "12345678901",
      vehicleModel: "Veículo Sintético", licencePlate: "TST1234", vehicleColor: "Prata",
      reviewToken,
    },
  };
}

function nextSundayStart(): Date {
  const start = new Date("2080-01-01T12:00:00.000Z");
  start.setUTCDate(start.getUTCDate() + ((7 - start.getUTCDay()) % 7));
  start.setUTCDate(start.getUTCDate() + (Number.parseInt(randomUUID().slice(0, 8), 16) % 10_000) * 7);
  start.setUTCHours(12, 0, 0, 0);
  return start;
}
