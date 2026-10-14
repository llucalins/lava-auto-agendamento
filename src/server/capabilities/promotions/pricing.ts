import type { Pool } from "pg";

import { calculateDiscount } from "./rules";

export const PROMOTION_PRICING_LOCK = "lava-auto:promotion-pricing";

export async function acquirePromotionPricingLock(
  pool: Pick<Pool, "query">,
  mode: "READ" | "WRITE",
): Promise<void> {
  await pool.query(
    mode === "READ"
      ? "select pg_advisory_xact_lock_shared(hashtextextended($1, 0))"
      : "select pg_advisory_xact_lock(hashtextextended($1, 0))",
    [PROMOTION_PRICING_LOCK],
  );
}

export type PromotionPrice = Readonly<{
  basePriceCentavos: string;
  discountCentavos: string;
  finalPriceCentavos: string;
  promotion: Readonly<{ id: string; revision: number; name: string }> | null;
}>;

type PromotionPriceRow = Readonly<{
  start: Date;
  basePriceCentavos: string;
  discountKind: "PERCENTAGE" | "FIXED" | null;
  discountValue: string | null;
  promotionId: string | null;
  promotionRevision: number | null;
  promotionName: string | null;
  eligibleCount: number;
}>;

export async function calculatePricesForStarts(
  pool: Pick<Pool, "query">,
  packageId: string,
  starts: readonly Date[],
): Promise<ReadonlyMap<string, PromotionPrice>> {
  if (starts.length === 0) return new Map();
  const result = await pool.query<PromotionPriceRow>(
    `with selected_package as (
       select revision.revision as package_revision, revision.price_centavos::text as base_price_centavos
       from app.service_packages package
       join app.service_package_revisions revision
         on revision.package_id = package.package_id and revision.revision = package.current_revision
       where package.package_id = $1 and revision.state = 'ACTIVE'
     ), candidates as (
       select input.start, package.base_price_centavos, calendar.timezone,
              (input.start at time zone calendar.timezone)::date as local_date,
              (input.start at time zone calendar.timezone)::time as local_time
       from unnest($2::timestamptz[]) input(start)
       cross join selected_package package
       cross join app.operating_calendar calendar
     ), eligible as (
       select candidate.start, candidate.base_price_centavos,
              promotion.promotion_id, promotion.revision, promotion.name,
              promotion.discount_kind, promotion.discount_value::text as discount_value
       from candidates candidate
       left join app.promotion_services service on service.package_id = $1
       left join app.promotions promotion
         on promotion.promotion_id = service.promotion_id
        and promotion.state = 'ACTIVE'
        and candidate.local_date between promotion.valid_from and promotion.valid_through
        and (promotion.weekdays is null or extract(dow from candidate.local_date)::smallint = any(promotion.weekdays))
        and (promotion.starts_at is null or candidate.local_time >= promotion.starts_at)
        and (promotion.ends_at is null or candidate.local_time < promotion.ends_at)
     )
     select start, base_price_centavos as "basePriceCentavos",
            discount_kind as "discountKind", discount_value as "discountValue",
            promotion_id as "promotionId", revision as "promotionRevision", name as "promotionName",
            count(promotion_id) over (partition by start)::integer as "eligibleCount"
     from eligible
     order by start, promotion_id nulls last`,
    [packageId, starts],
  );
  const prices = new Map<string, PromotionPrice>();
  for (const row of result.rows) {
    if (row.eligibleCount > 1) throw new Error("Ambiguous active promotions");
    const key = row.start.toISOString();
    if (prices.has(key)) continue;
    const base = Number(row.basePriceCentavos);
    if (!Number.isSafeInteger(base)) throw new Error("Service price is invalid");
    const discount = row.discountKind && row.discountValue
      ? calculateDiscount(base, { kind: row.discountKind, value: Number(row.discountValue) })
      : 0;
    prices.set(key, {
      basePriceCentavos: String(base),
      discountCentavos: String(discount),
      finalPriceCentavos: String(base - discount),
      promotion: row.promotionId && row.promotionRevision !== null && row.promotionName
        ? { id: row.promotionId, revision: row.promotionRevision, name: row.promotionName }
        : null,
    });
  }
  return prices;
}

export function samePromotionPrice(left: PromotionPrice, right: PromotionPrice): boolean {
  return left.basePriceCentavos === right.basePriceCentavos
    && left.discountCentavos === right.discountCentavos
    && left.finalPriceCentavos === right.finalPriceCentavos
    && left.promotion?.id === right.promotion?.id
    && left.promotion?.revision === right.promotion?.revision
    && left.promotion?.name === right.promotion?.name;
}
