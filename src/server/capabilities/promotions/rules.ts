const FORTALEZA = "America/Fortaleza";

export type PromotionDiscount = Readonly<{ kind: "PERCENTAGE" | "FIXED"; value: number }>;
export type PromotionSchedule = Readonly<{
  validFrom: string;
  validThrough: string;
  weekdays: readonly number[] | null;
  startsAt: string | null;
  endsAt: string | null;
}>;

export function calculateDiscount(basePriceCentavos: number, discount: PromotionDiscount): number {
  if (!Number.isSafeInteger(basePriceCentavos) || basePriceCentavos < 0) throw new Error("Invalid base price");
  if (!Number.isSafeInteger(discount.value) || discount.value <= 0) throw new Error("Invalid discount");
  if (discount.kind === "PERCENTAGE") {
    if (discount.value > 100) throw new Error("Invalid discount");
    return Number((BigInt(basePriceCentavos) * BigInt(discount.value) + 50n) / 100n);
  }
  if (discount.value > basePriceCentavos) throw new Error("Discount exceeds service price");
  return discount.value;
}

function localDateAndTime(value: Date): { date: string; time: string; weekday: number } {
  if (Number.isNaN(value.getTime())) throw new Error("Invalid service start");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FORTALEZA,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const time = `${part("hour")}:${part("minute")}`;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { date, time, weekday };
}

export function promotionMatchesLocalDateTime(schedule: PromotionSchedule, instant: Date): boolean {
  const local = localDateAndTime(instant);
  return local.date >= schedule.validFrom
    && local.date <= schedule.validThrough
    && (schedule.weekdays === null || schedule.weekdays.includes(local.weekday))
    && (schedule.startsAt === null || (local.time >= schedule.startsAt && local.time < schedule.endsAt!));
}

function hasCommonWeekday(
  start: string,
  end: string,
  left: readonly number[] | null,
  right: readonly number[] | null,
): boolean {
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  for (; cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    if ((left === null || left.includes(weekday)) && (right === null || right.includes(weekday))) return true;
  }
  return false;
}

export function promotionSchedulesOverlap(left: PromotionSchedule, right: PromotionSchedule): boolean {
  const start = left.validFrom > right.validFrom ? left.validFrom : right.validFrom;
  const end = left.validThrough < right.validThrough ? left.validThrough : right.validThrough;
  if (start > end || !hasCommonWeekday(start, end, left.weekdays, right.weekdays)) return false;
  const leftStart = left.startsAt ?? "00:00";
  const leftEnd = left.endsAt ?? "24:00";
  const rightStart = right.startsAt ?? "00:00";
  const rightEnd = right.endsAt ?? "24:00";
  return leftStart < rightEnd && rightStart < leftEnd;
}
