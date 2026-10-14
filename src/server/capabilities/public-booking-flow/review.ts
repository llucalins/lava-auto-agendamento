import { createHmac, timingSafeEqual } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { findSelectableStarts } from "../operating-calendar/availability";
import { withTransaction } from "../../persistence/transaction";
import { acquirePromotionPricingLock } from "../promotions/pricing";
import type { PromotionPrice } from "../promotions/pricing";

const inputSchema = z.object({ packageId: z.uuid(), serviceStart: z.date() }).strict();
const payloadSchema = z.object({
  version: z.literal(2),
  packageId: z.uuid(),
  packageRevision: z.number().int().positive(),
  calendarRevision: z.number().int().positive(),
  serviceStart: z.iso.datetime({ offset: true }),
  serviceEnd: z.iso.datetime({ offset: true }),
  price: z.object({
    basePriceCentavos: z.string().regex(/^\d+$/),
    discountCentavos: z.string().regex(/^\d+$/),
    finalPriceCentavos: z.string().regex(/^\d+$/),
    promotion: z.object({ id: z.uuid(), revision: z.number().int().positive(), name: z.string().min(1).max(100) }).nullable(),
  }),
});

type PackageRow = Readonly<{
  id: string;
  revision: number;
  name: string;
  description: string | null;
  priceCentavos: string;
  durationMinutes: number;
}>;

export type BookingReviewPayload = z.infer<typeof payloadSchema>;
export type BookingReviewResult =
  | Readonly<{
      kind: "READY";
      package: PackageRow;
      calendarRevision: number;
      start: string;
      end: string;
      price: PromotionPrice;
      reviewToken: string;
    }>
  | Readonly<{ kind: "UNAVAILABLE" }>;

function signature(encodedPayload: string, signingKey: string): string {
  if (signingKey.length < 32 || signingKey.length > 1_024) throw new Error("Review signing key is invalid.");
  return createHmac("sha256", signingKey).update(encodedPayload).digest("base64url");
}

function signBookingReview(payload: BookingReviewPayload, signingKey: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payloadSchema.parse(payload))).toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload, signingKey)}`;
}

export function verifyBookingReview(token: string, signingKey: string): BookingReviewPayload {
  const [encodedPayload, presentedSignature, extra] = token.split(".");
  if (!encodedPayload || !presentedSignature || extra || token.length > 2_048) {
    throw new Error("Booking review is invalid.");
  }
  const expectedSignature = signature(encodedPayload, signingKey);
  const expected = Buffer.from(expectedSignature);
  const presented = Buffer.from(presentedSignature);
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) {
    throw new Error("Booking review is invalid.");
  }
  try {
    return payloadSchema.parse(JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")));
  } catch {
    throw new Error("Booking review is invalid.");
  }
}

export async function createBookingReview(
  pool: Pick<Pool, "query"> | PoolClient,
  input: Readonly<{ packageId: string; serviceStart: Date }>,
  signingKey: string,
): Promise<BookingReviewResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || Number.isNaN(parsed.data.serviceStart.getTime())) {
    throw new Error("Booking review request is invalid.");
  }

  const operation = async (client: Pick<Pool, "query">): Promise<BookingReviewResult> => {
  await acquirePromotionPricingLock(client, "READ");
  const packages = await client.query<PackageRow>(
    `select r.package_id as id, r.revision, r.name, r.description,
            r.price_centavos::text as "priceCentavos", r.duration_minutes as "durationMinutes"
     from app.service_packages p
     join app.service_package_revisions r
       on r.package_id = p.package_id and r.revision = p.current_revision
     where p.package_id = $1 and r.state = 'ACTIVE'`,
    [parsed.data.packageId],
  );
  const currentPackage = packages.rows[0];
  if (!currentPackage) return { kind: "UNAVAILABLE" };

  const selectable = await findSelectableStarts(client, {
    packageId: parsed.data.packageId,
    starts: [parsed.data.serviceStart],
  });
  const slot = selectable.find((candidate) => candidate.start === parsed.data.serviceStart.toISOString());
  if (!slot || slot.packageRevision !== currentPackage.revision) return { kind: "UNAVAILABLE" };

  const reviewToken = signBookingReview(
    {
      version: 2,
      packageId: currentPackage.id,
      packageRevision: currentPackage.revision,
      calendarRevision: slot.calendarRevision,
      serviceStart: slot.start,
      serviceEnd: slot.end,
      price: slot.price,
    },
    signingKey,
  );
  return {
    kind: "READY",
    package: currentPackage,
    calendarRevision: slot.calendarRevision,
    start: slot.start,
    end: slot.end,
    price: slot.price,
    reviewToken,
  };
  };
  if ("release" in pool) return operation(pool);
  if ("connect" in pool) return withTransaction(pool as Pick<Pool, "connect">, operation);
  return operation(pool);
}
