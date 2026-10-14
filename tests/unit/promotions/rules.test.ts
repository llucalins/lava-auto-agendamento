import { describe, expect, it } from "vitest";

import {
  calculateDiscount,
  promotionSchedulesOverlap,
  promotionMatchesLocalDateTime,
} from "../../../src/server/capabilities/promotions/rules";

describe("promotion rules", () => {
  it("rounds percentage discounts half up to a cent without floating point", () => {
    expect(calculateDiscount(101, { kind: "PERCENTAGE", value: 50 })).toBe(51);
    expect(calculateDiscount(100, { kind: "PERCENTAGE", value: 100 })).toBe(100);
  });

  it("rejects discounts outside valid service price bounds", () => {
    expect(() => calculateDiscount(100, { kind: "PERCENTAGE", value: 0 })).toThrow();
    expect(() => calculateDiscount(100, { kind: "FIXED", value: 101 })).toThrow();
    expect(() => calculateDiscount(-1, { kind: "FIXED", value: 1 })).toThrow();
  });

  it("uses Fortaleza local dates, weekdays, and half-open time windows", () => {
    const schedule = { validFrom: "2026-10-12", validThrough: "2026-10-18", weekdays: [1], startsAt: "09:00", endsAt: "12:00" };
    expect(promotionMatchesLocalDateTime(schedule, new Date("2026-10-12T12:00:00Z"))).toBe(true);
    expect(promotionMatchesLocalDateTime(schedule, new Date("2026-10-12T15:00:00Z"))).toBe(false);
    expect(promotionMatchesLocalDateTime(schedule, new Date("2026-10-13T13:00:00Z"))).toBe(false);
  });

  it("detects ambiguous overlapping schedules only when a common local day and time exist", () => {
    const first = { validFrom: "2026-10-12", validThrough: "2026-10-18", weekdays: [1, 2], startsAt: "09:00", endsAt: "12:00" };
    expect(promotionSchedulesOverlap(first, { ...first, weekdays: [2], startsAt: "11:00", endsAt: "13:00" })).toBe(true);
    expect(promotionSchedulesOverlap(first, { ...first, weekdays: [3], startsAt: "11:00", endsAt: "13:00" })).toBe(false);
    expect(promotionSchedulesOverlap(first, { ...first, weekdays: [2], startsAt: "12:00", endsAt: "13:00" })).toBe(false);
  });
});
