import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { withTransaction } from "../../persistence/transaction";
import { resolveAuthorizedSession } from "../admin-access/authorization";
import { writeAuditEvent } from "../audit-trail/writer";
import { acquirePromotionPricingLock } from "./pricing";
import { promotionSchedulesOverlap, type PromotionSchedule } from "./rules";

const idArraySchema = z.array(z.uuid()).min(1).max(50).transform((ids) => [...new Set(ids)]);
const scheduleSchema = z.object({
  validFrom: z.iso.date(),
  validThrough: z.iso.date(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  startsAt: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  endsAt: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
}).strict().superRefine((input, context) => {
  if (input.validFrom > input.validThrough) context.addIssue({ code: "custom", message: "Invalid date range" });
  const recurring = input.weekdays !== undefined || input.startsAt !== undefined || input.endsAt !== undefined;
  if (recurring && (!input.weekdays?.length || !input.startsAt || !input.endsAt || input.startsAt >= input.endsAt)) {
    context.addIssue({ code: "custom", message: "Invalid recurring window" });
  }
  if (input.weekdays && new Set(input.weekdays).size !== input.weekdays.length) {
    context.addIssue({ code: "custom", message: "Duplicate weekdays" });
  }
});

const termsSchema = scheduleSchema.extend({
  name: z.string().trim().min(1).max(100),
  discountKind: z.enum(["PERCENTAGE", "FIXED"]),
  discountValue: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  packageIds: idArraySchema,
  state: z.enum(["ACTIVE", "INACTIVE"]),
}).strict().superRefine((input, context) => {
  if (input.discountKind === "PERCENTAGE" && input.discountValue > 100) {
    context.addIssue({ code: "custom", message: "Invalid percentage" });
  }
});

const updateSchema = termsSchema.extend({ promotionId: z.uuid(), expectedRevision: z.number().int().positive() }).strict();

export type PromotionTerms = z.infer<typeof termsSchema>;
export type ManagedPromotion = Readonly<PromotionTerms & { promotionId: string; revision: number }>;
type PromotionMutation = Readonly<{ promotionId: string; revision: number; state: "ACTIVE" | "INACTIVE"; auditEventId: string }>;
type ManagedPromotionRow = Omit<ManagedPromotion, "discountValue"> & Readonly<{ discountValue: string }>;
type ExistingPromotion = Readonly<{
  promotionId: string;
  validFrom: string;
  validThrough: string;
  weekdays: number[] | null;
  startsAt: string | null;
  endsAt: string | null;
  packageIds: string[];
}>;

export async function listAdminPromotions(pool: Pick<Pool, "query">, sessionCookie: string): Promise<ManagedPromotion[]> {
  if (!(await resolveAuthorizedSession(pool, sessionCookie, "PACKAGE_MANAGE"))) throw new Error("Forbidden");
  const result = await pool.query<ManagedPromotionRow>(
    `select promotion.promotion_id as "promotionId", promotion.revision,
            promotion.name, promotion.discount_kind as "discountKind",
            promotion.discount_value::text as "discountValue",
            promotion.state, promotion.valid_from::text as "validFrom",
            promotion.valid_through::text as "validThrough",
            promotion.weekdays::integer[] as weekdays,
            to_char(promotion.starts_at, 'HH24:MI') as "startsAt",
            to_char(promotion.ends_at, 'HH24:MI') as "endsAt",
            coalesce(array_agg(service.package_id) filter (where service.package_id is not null), '{}') as "packageIds"
     from app.promotions promotion
     left join app.promotion_services service using (promotion_id)
     group by promotion.promotion_id
     order by promotion.valid_from desc, promotion.name, promotion.promotion_id
     limit 100`,
  );
  return result.rows.map((row) => ({ ...row, discountValue: Number(row.discountValue) }));
}

export async function createAdminPromotion(
  pool: Pick<Pool, "connect">,
  sessionCookie: string,
  input: unknown,
): Promise<PromotionMutation> {
  return withTransaction(pool, (client) => createAdminPromotionInTransaction(client, sessionCookie, input));
}

async function createAdminPromotionInTransaction(
  client: PoolClient,
  sessionCookie: string,
  input: unknown,
): Promise<PromotionMutation> {
  const parsed = termsSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid promotion terms");
  const actor = await resolveAuthorizedSession(client, sessionCookie, "PACKAGE_MANAGE");
  if (!actor) throw new Error("Forbidden");
  await lockPromotionPricing(client);
  await validateServicesAndConflicts(client, parsed.data);
  const inserted = await client.query<{ promotionId: string }>(
    `insert into app.promotions (
       revision, name, discount_kind, discount_value, state, valid_from, valid_through,
       weekdays, starts_at, ends_at
     ) values (1, $1, $2, $3, $4, $5, $6, $7::smallint[], $8::time, $9::time)
     returning promotion_id as "promotionId"`,
    [parsed.data.name, parsed.data.discountKind, parsed.data.discountValue, parsed.data.state,
      parsed.data.validFrom, parsed.data.validThrough, parsed.data.weekdays ?? null,
      parsed.data.startsAt ?? null, parsed.data.endsAt ?? null],
  );
  const promotionId = inserted.rows[0]?.promotionId;
  if (!promotionId) throw new Error("Invalid promotion terms");
  await replaceServices(client, promotionId, parsed.data.packageIds);
  const auditEventId = await writeAuditEvent(client, {
    category: "CONFIGURATION_MUTATION", action: "PROMOTION_CREATED", outcome: "SUCCEEDED",
    actorRef: actor.adminId, targetRef: promotionId, reasonCode: "PROMOTION_INITIAL_TERMS_ESTABLISHED",
  });
  return { promotionId, revision: 1, state: parsed.data.state, auditEventId };
}

export async function reviseAdminPromotion(
  pool: Pick<Pool, "connect">,
  sessionCookie: string,
  input: unknown,
): Promise<PromotionMutation> {
  return withTransaction(pool, (client) => reviseAdminPromotionInTransaction(client, sessionCookie, input));
}

async function reviseAdminPromotionInTransaction(
  client: PoolClient,
  sessionCookie: string,
  input: unknown,
): Promise<PromotionMutation> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid promotion terms");
  const actor = await resolveAuthorizedSession(client, sessionCookie, "PACKAGE_MANAGE");
  if (!actor) throw new Error("Forbidden");
  await lockPromotionPricing(client);
  const currentResult = await client.query<{ revision: number }>(
    "select revision from app.promotions where promotion_id = $1 for update", [parsed.data.promotionId],
  );
  const currentRevision = currentResult.rows[0]?.revision;
  if (currentRevision !== parsed.data.expectedRevision) throw new Error("Stale promotion revision");
  await validateServicesAndConflicts(client, parsed.data, parsed.data.promotionId);
  const revision = currentRevision + 1;
  const updated = await client.query(
    `update app.promotions set revision = $2, name = $3, discount_kind = $4,
       discount_value = $5, state = $6, valid_from = $7, valid_through = $8,
       weekdays = $9::smallint[], starts_at = $10::time, ends_at = $11::time
     where promotion_id = $1 and revision = $12 returning promotion_id`,
    [parsed.data.promotionId, revision, parsed.data.name, parsed.data.discountKind,
      parsed.data.discountValue, parsed.data.state, parsed.data.validFrom, parsed.data.validThrough,
      parsed.data.weekdays ?? null, parsed.data.startsAt ?? null, parsed.data.endsAt ?? null, currentRevision],
  );
  if (updated.rowCount !== 1) throw new Error("Stale promotion revision");
  await replaceServices(client, parsed.data.promotionId, parsed.data.packageIds);
  const auditEventId = await writeAuditEvent(client, {
    category: "CONFIGURATION_MUTATION", action: "PROMOTION_REVISION_PUBLISHED", outcome: "SUCCEEDED",
    actorRef: actor.adminId, targetRef: parsed.data.promotionId,
    reasonCode: parsed.data.state === "ACTIVE" ? "PROMOTION_TERMS_OR_STATE_CHANGED" : "PROMOTION_DEACTIVATED",
  });
  return { promotionId: parsed.data.promotionId, revision, state: parsed.data.state, auditEventId };
}

async function lockPromotionPricing(client: Pick<PoolClient, "query">): Promise<void> {
  await acquirePromotionPricingLock(client, "WRITE");
}

async function validateServicesAndConflicts(
  client: Pick<PoolClient, "query">,
  terms: PromotionTerms,
  excludedPromotionId?: string,
): Promise<void> {
  const services = await client.query<{ packageId: string; priceCentavos: string }>(
    `select package.package_id as "packageId", revision.price_centavos::text as "priceCentavos"
     from app.service_packages package
     join app.service_package_revisions revision
       on revision.package_id = package.package_id and revision.revision = package.current_revision
     where package.package_id = any($1::uuid[]) and revision.state = 'ACTIVE'
     order by package.package_id for share of package`,
    [terms.packageIds],
  );
  if (services.rows.length !== terms.packageIds.length) throw new Error("Promotion service is unavailable");
  if (terms.discountKind === "FIXED" && services.rows.some((service) => terms.discountValue > Number(service.priceCentavos))) {
    throw new Error("Fixed discount exceeds service price");
  }
  if (terms.state !== "ACTIVE") return;

  const existing = await client.query<ExistingPromotion>(
    `select promotion.promotion_id as "promotionId", promotion.valid_from::text as "validFrom",
            promotion.valid_through::text as "validThrough", promotion.weekdays::integer[] as weekdays,
            to_char(promotion.starts_at, 'HH24:MI') as "startsAt",
            to_char(promotion.ends_at, 'HH24:MI') as "endsAt",
            array_agg(service.package_id::text) as "packageIds"
     from app.promotions promotion
     join app.promotion_services service using (promotion_id)
     where promotion.state = 'ACTIVE' and promotion.promotion_id <> coalesce($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
       and service.package_id = any($2::uuid[])
     group by promotion.promotion_id`,
    [excludedPromotionId ?? null, terms.packageIds],
  );
  const proposed = scheduleFromTerms(terms);
  for (const other of existing.rows) {
    if (promotionSchedulesOverlap(proposed, scheduleFromExisting(other))) {
      throw new Error("Promotion conflicts with an active promotion for this service");
    }
  }
}

function scheduleFromTerms(terms: PromotionTerms): PromotionSchedule {
  return {
    validFrom: terms.validFrom, validThrough: terms.validThrough,
    weekdays: terms.weekdays ?? null, startsAt: terms.startsAt ?? null, endsAt: terms.endsAt ?? null,
  };
}

function scheduleFromExisting(promotion: ExistingPromotion): PromotionSchedule {
  return {
    validFrom: promotion.validFrom, validThrough: promotion.validThrough,
    weekdays: promotion.weekdays, startsAt: promotion.startsAt, endsAt: promotion.endsAt,
  };
}

async function replaceServices(client: Pick<PoolClient, "query">, promotionId: string, packageIds: readonly string[]) {
  await client.query("delete from app.promotion_services where promotion_id = $1", [promotionId]);
  for (const packageId of packageIds) {
    await client.query("insert into app.promotion_services (promotion_id, package_id) values ($1, $2)", [promotionId, packageId]);
  }
}
