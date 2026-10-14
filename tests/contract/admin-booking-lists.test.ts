import { describe, expect, it } from "vitest";

import { listAdminBookings } from "../../src/server/capabilities/admin-operations/booking-lists";

describe("admin booking lists", () => {
  it("uses a bounded, non-sensitive today projection", async () => {
    const queries: string[] = [];
    const parameters: unknown[][] = [];
    const pool = {
      query: async (text: string, values: unknown[] = []) => {
        queries.push(text);
        parameters.push(values);
        return queries.length === 1
          ? { rows: [{ adminId: "11111111-1111-4111-8111-111111111111", role: "OWNER", accountState: "ACTIVE", authorizationVersion: 1 }] }
          : { rows: [] };
      },
    };

    await expect(listAdminBookings(pool as never, "A".repeat(43), { category: "today", page: 1, now: new Date("2026-08-27T12:00:00Z"), status: "SCHEDULED" })).resolves.toEqual({ items: [], hasNextPage: false });
    const projection = queries.at(-1) ?? "";
    expect(projection).toContain("full_name");
    expect(projection).toContain("vehicle_model");
    expect(projection).not.toMatch(/\b(cpf|pickup_address|phone_whatsapp|email|licence_plate)\b/i);
    expect(projection).toContain("limit 51");
    expect(projection).toContain("calendar.timezone");
    expect(projection).toContain("snapshot.discount_centavos");
    expect(projection).toContain("snapshot.final_price_centavos");
    expect(projection).toContain("booking.status = $4");
    expect(projection).toContain("booking.service_start asc,\n              booking.booking_id asc");
    expect(parameters.at(-1)).toEqual(["today", "2026-08-27T12:00:00.000Z", 0, "SCHEDULED"]);
  });

  it("returns only the requested page and indicates when another bounded page exists", async () => {
    const row = { bookingId: "11111111-1111-4111-8111-111111111111", serviceStart: new Date("2026-08-28T12:00:00Z"), status: "SCHEDULED", packageName: "Synthetic", serviceMode: "DROP_OFF", fullName: "Synthetic", vehicleModel: "Synthetic", vehicleColor: "Synthetic", basePriceCentavos: "1000", discountCentavos: "0", finalPriceCentavos: "1000", promotionName: null };
    let call = 0;
    const pool = {
      query: async () => ++call === 1
        ? { rows: [{ adminId: "11111111-1111-4111-8111-111111111111", role: "OWNER", accountState: "ACTIVE", authorizationVersion: 1 }] }
        : { rows: Array.from({ length: 51 }, () => row) },
    };

    await expect(listAdminBookings(pool as never, "A".repeat(43), { category: "upcoming", page: 2, now: new Date("2026-08-27T12:00:00Z") }))
      .resolves.toMatchObject({ items: Array.from({ length: 50 }, () => expect.objectContaining({ bookingId: row.bookingId })), hasNextPage: true });
  });
});
