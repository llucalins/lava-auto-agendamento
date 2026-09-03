import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import { getAdminBookingDetail } from "../../src/server/capabilities/admin-operations/booking-detail";
import { persistBookingPii } from "../../src/server/capabilities/booking-lifecycle/pii-repository";
import { createScheduledBooking } from "../../src/server/capabilities/booking-lifecycle/repository";
import { createIntegrationPool } from "../support/postgres";

describe("PostgreSQL admin booking detail", () => {
  const pools: ReturnType<typeof createIntegrationPool>[] = [];
  afterEach(async () => { await Promise.all(pools.splice(0).map((pool) => pool.end())); });

  it("returns the authorized ordinary projection without CPF or pickup address", async () => {
    const pool = createIntegrationPool();
    pools.push(pool);
    const packageId = randomUUID();
    const issuer = `https://${randomUUID()}.example.test`;
    await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
    await pool.query("insert into app.service_package_revisions values ($1, 1, 'Completo', 'Lavagem', 12500, 60, 'ACTIVE')", [packageId]);
    const booking = await createScheduledBooking(pool, { packageId, serviceStart: new Date("2026-08-27T12:00:00Z"), serviceMode: "DROP_OFF", intendedPaymentMethod: "PIX" });
    await persistBookingPii(pool, { bookingId: booking.bookingId, fullName: "Ana", phoneWhatsapp: "5585999999999", email: "ana@example.test", cpf: "12345678901", vehicleModel: "Hatch", licencePlate: "ABC1D23", vehicleColor: "Prata" });
    await pool.query("insert into app.admin_identities (issuer, subject, role) values ($1, 'employee', 'EMPLOYEE')", [issuer]);
    const session = await createLocalSession(pool, { issuer, subject: "employee", mfaAssured: true });

    await expect(getAdminBookingDetail(pool, session.cookieValue, booking.bookingId)).resolves.toEqual(expect.objectContaining({
      bookingId: booking.bookingId,
      fullName: "Ana",
      phoneWhatsapp: "5585999999999",
      email: "ana@example.test",
      licencePlate: "ABC1D23",
      package: { name: "Completo", description: "Lavagem", priceCentavos: 12500, currency: "BRL", durationMinutes: 60 },
    }));
  });
});
