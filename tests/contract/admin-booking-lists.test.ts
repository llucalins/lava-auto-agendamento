import { describe, expect, it } from "vitest";

import { listAdminBookings } from "../../src/server/capabilities/admin-operations/booking-lists";

describe("admin booking lists", () => {
  it("uses a bounded, non-sensitive today projection", async () => {
    const queries: string[] = [];
    const pool = {
      query: async (text: string) => {
        queries.push(text);
        return queries.length === 1
          ? { rows: [{ adminId: "11111111-1111-4111-8111-111111111111", role: "OWNER", accountState: "ACTIVE", authorizationVersion: 1 }] }
          : { rows: [] };
      },
    };

    await expect(listAdminBookings(pool as never, "A".repeat(43), { category: "today", page: 1, now: new Date("2026-08-27T12:00:00Z") })).resolves.toEqual([]);
    const projection = queries.at(-1) ?? "";
    expect(projection).toContain("full_name");
    expect(projection).toContain("vehicle_model");
    expect(projection).not.toMatch(/\b(cpf|pickup_address|phone_whatsapp|email|licence_plate)\b/i);
    expect(projection).toContain("limit 50");
    expect(projection).toContain("calendar.timezone");
  });
});
