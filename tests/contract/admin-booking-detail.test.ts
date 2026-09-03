import { describe, expect, it } from "vitest";

import { getAdminBookingDetail } from "../../src/server/capabilities/admin-operations/booking-detail";

const bookingId = "11111111-1111-4111-8111-111111111111";
const sessionCookie = "A".repeat(43);

describe("admin booking detail", () => {
  it("returns the approved detail projection only after current BOOKING_READ authorization", async () => {
    const queries: string[] = [];
    const pool = {
      query: async (text: string) => {
        queries.push(text);
        return queries.length === 1
          ? { rows: [{ adminId: "22222222-2222-4222-8222-222222222222", role: "EMPLOYEE", accountState: "ACTIVE", authorizationVersion: 1 }] }
          : { rows: [{ bookingId, serviceStart: new Date("2026-08-27T12:00:00Z"), serviceEnd: new Date("2026-08-27T13:00:00Z"), status: "SCHEDULED", packageName: "Completo", packageDescription: "Lavagem", packagePriceCentavos: "12500", packageCurrency: "BRL", packageDurationMinutes: 60, intendedPaymentMethod: "PIX", serviceMode: "DROP_OFF", fullName: "Ana", phoneWhatsapp: "5585999999999", email: "ana@example.test", vehicleModel: "Hatch", licencePlate: "ABC1D23", vehicleColor: "Prata" }] };
      },
    };

    await expect(getAdminBookingDetail(pool as never, sessionCookie, bookingId)).resolves.toEqual({
      bookingId,
      serviceStart: "2026-08-27T12:00:00.000Z",
      serviceEnd: "2026-08-27T13:00:00.000Z",
      status: "SCHEDULED",
      package: { name: "Completo", description: "Lavagem", priceCentavos: 12500, currency: "BRL", durationMinutes: 60 },
      intendedPaymentMethod: "PIX",
      serviceMode: "DROP_OFF",
      fullName: "Ana",
      phoneWhatsapp: "5585999999999",
      email: "ana@example.test",
      vehicleModel: "Hatch",
      licencePlate: "ABC1D23",
      vehicleColor: "Prata",
    });

    const projection = queries.at(-1) ?? "";
    expect(projection).not.toMatch(/\b(cpf|pickup_address|revision|session|authorization)\b/i);
    expect(projection).toContain("where booking.booking_id = $1");
  });

  it("rejects invalid internal IDs before querying booking data", async () => {
    let calls = 0;
    const pool = { query: async () => { calls += 1; return { rows: [] }; } };

    await expect(getAdminBookingDetail(pool as never, sessionCookie, "not-a-booking-id")).rejects.toThrow("Forbidden");
    expect(calls).toBe(0);
  });

  it("does not treat a known booking ID as authorization", async () => {
    let calls = 0;
    const pool = { query: async () => { calls += 1; return { rows: [] }; } };

    await expect(getAdminBookingDetail(pool as never, sessionCookie, bookingId)).rejects.toThrow("Forbidden");
    expect(calls).toBe(1);
  });
});
