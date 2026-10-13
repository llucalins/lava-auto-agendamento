import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createBookingReview, verifyBookingReview } from "../../src/server/capabilities/public-booking-flow/review";
import { acquireCalendarConfirmationLock } from "../../src/server/capabilities/operating-calendar/coordination";
import { createIntegrationPool } from "../support/postgres";

const signingKey = "test-only-confirmation-fingerprint-key";

describe("authoritative booking review", () => {
  it("returns signed current package terms and availability revisions", async () => {
    const pool = createIntegrationPool();
    const client = await pool.connect();
    const packageId = randomUUID();
    const start = uniqueSundayStart();
    const localDate = start.toISOString().slice(0, 10);
    await client.query("begin");
    await acquireCalendarConfirmationLock(client, "MUTATION");
    await client.query("insert into app.operating_calendar default values on conflict do nothing");
    await client.query(
      `insert into app.calendar_overrides (override_id, calendar_date, starts_at, ends_at, is_closed, revision)
       select $1, $2, '08:00', '12:00', false, revision from app.operating_calendar where calendar_id = true`,
      [randomUUID(), localDate],
    );
    await client.query("insert into app.service_packages values ($1, 1)", [packageId]);
    await client.query(
      "insert into app.service_package_revisions values ($1, 1, 'Completa', 'Cera', 12500, 30, 'ACTIVE')",
      [packageId],
    );

    try {
      const review = await createBookingReview(client, { packageId, serviceStart: start }, signingKey);

      if (review.kind !== "READY") throw new Error("Expected an available review.");
      expect(review).toMatchObject({
        kind: "READY",
        package: { id: packageId, revision: 1, name: "Completa", priceCentavos: "12500", durationMinutes: 30 },
        start: start.toISOString(),
        end: new Date(start.getTime() + 30 * 60_000).toISOString(),
      });
      expect(verifyBookingReview(review.reviewToken, signingKey)).toMatchObject({
        packageId,
        packageRevision: 1,
        calendarRevision: review.calendarRevision,
        serviceStart: start.toISOString(),
      });
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  it("rejects a start that is not currently selectable", async () => {
    const pool = createIntegrationPool();
    const client = await pool.connect();
    const packageId = randomUUID();
    await client.query("begin");
    await acquireCalendarConfirmationLock(client, "MUTATION");
    await client.query("insert into app.operating_calendar default values on conflict do nothing");
    await client.query("insert into app.service_packages values ($1, 1)", [packageId]);
    await client.query(
      "insert into app.service_package_revisions values ($1, 1, 'Completa', null, 12500, 30, 'ACTIVE')",
      [packageId],
    );
    await client.query(
      `insert into app.calendar_overrides (override_id, calendar_date, starts_at, ends_at, is_closed, revision)
       select $1, '2070-01-04', null, null, true, revision from app.operating_calendar where calendar_id = true`,
      [randomUUID()],
    );

    try {
      await expect(
        createBookingReview(client, { packageId, serviceStart: new Date("2070-01-04T12:00:00.000Z") }, signingKey),
      ).resolves.toEqual({ kind: "UNAVAILABLE" });
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });
});

function uniqueSundayStart(): Date {
  const date = new Date("2080-01-01T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + (Number.parseInt(randomUUID().slice(0, 8), 16) % 5_000));
  date.setUTCDate(date.getUTCDate() + ((7 - date.getUTCDay()) % 7));
  return date;
}
