import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { Pool } from "pg";
import { z } from "zod";

const operationScope = "public.booking.confirm";

const materialSchema = z
  .object({
    packageId: z.uuid(),
    serviceStart: z.date(),
    serviceMode: z.enum(["DROP_OFF", "PICKUP_REQUESTED"]),
    intendedPaymentMethod: z.enum(["PIX", "CASH", "CREDIT_CARD", "DEBIT_CARD"]),
    fullName: z.string().trim().min(1).max(200),
    phoneWhatsapp: z.string().trim().min(1).max(30),
    email: z.string().trim().email().max(254).optional(),
    cpf: z.string().trim().min(1).max(32),
    vehicleModel: z.string().trim().min(1).max(100),
    licencePlate: z.string().trim().min(1).max(32),
    vehicleColor: z.string().trim().min(1).max(64),
    pickupAddress: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.serviceMode === "PICKUP_REQUESTED" && !value.pickupAddress) {
      context.addIssue({ code: "custom", message: "Pickup address is required." });
    }
    if (value.serviceMode === "DROP_OFF" && value.pickupAddress) {
      context.addIssue({ code: "custom", message: "Drop-off has no pickup address." });
    }
  });

const outcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("COMMITTED"), bookingId: z.uuid() }),
  z.object({
    kind: z.literal("REJECTED"),
    code: z.enum([
      "CAPACITY_UNAVAILABLE",
      "STALE_PACKAGE",
      "STALE_CALENDAR",
      "STALE_BOOKING",
      "BOOKING_REQUEST_INVALID",
    ]),
  }),
]);

const commandSchema = z.object({
  intentKey: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  material: materialSchema,
  fingerprintKey: z.string().min(32).max(1_024),
  outcome: outcomeSchema,
  expiresAt: z.date(),
});

export type ConfirmationMaterial = z.infer<typeof materialSchema>;
export type ConfirmationOutcome = z.infer<typeof outcomeSchema>;
export type RecordConfirmationIntentCommand = z.infer<typeof commandSchema>;
type RejectionCode = Extract<ConfirmationOutcome, { kind: "REJECTED" }>["code"];

export type ConfirmationIntentRecognition =
  | Readonly<{ kind: "RECORDED"; outcome: ConfirmationOutcome }>
  | Readonly<{ kind: "REPLAY"; outcome: ConfirmationOutcome }>
  | Readonly<{ kind: "CONFLICT" }>;

type IntentRow = Readonly<{
  bookingId: string | null;
  outcomeCode: string;
  requestFingerprint: string;
  state: "COMMITTED" | "REJECTED";
}>;

function normalizedText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function canonicalMaterial(value: ConfirmationMaterial): string {
  const material = materialSchema.parse(value);

  return JSON.stringify({
    packageId: material.packageId.toLowerCase(),
    serviceStart: material.serviceStart.toISOString(),
    serviceMode: material.serviceMode,
    intendedPaymentMethod: material.intendedPaymentMethod,
    fullName: normalizedText(material.fullName),
    phoneWhatsapp: digits(material.phoneWhatsapp),
    email: material.email && normalizedText(material.email).toLowerCase(),
    cpf: digits(material.cpf),
    vehicleModel: normalizedText(material.vehicleModel),
    licencePlate: material.licencePlate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
    vehicleColor: normalizedText(material.vehicleColor),
    pickupAddress: material.pickupAddress && normalizedText(material.pickupAddress),
  });
}

export function fingerprintConfirmationMaterial(
  material: ConfirmationMaterial,
  fingerprintKey: string,
): string {
  if (fingerprintKey.length < 32 || fingerprintKey.length > 1_024) {
    throw new Error("Confirmation material is invalid.");
  }

  return createHmac("sha256", fingerprintKey).update(canonicalMaterial(material)).digest("hex");
}

function sameFingerprint(left: string, right: string): boolean {
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function rowOutcome(row: IntentRow): ConfirmationOutcome {
  if (row.state === "COMMITTED" && row.bookingId) {
    return { kind: "COMMITTED", bookingId: row.bookingId };
  }
  if (row.state === "REJECTED" && row.outcomeCode !== "BOOKING_CONFIRMED") {
    return { kind: "REJECTED", code: row.outcomeCode as RejectionCode };
  }
  throw new Error("Confirmation intent is invalid.");
}

export async function recordConfirmationIntentOutcome(
  pool: Pick<Pool, "query">,
  command: RecordConfirmationIntentCommand,
): Promise<ConfirmationIntentRecognition> {
  const parsed = commandSchema.safeParse(command);
  if (!parsed.success || Number.isNaN(parsed.data.expiresAt.getTime())) {
    throw new Error("Confirmation intent is invalid.");
  }

  const fingerprint = fingerprintConfirmationMaterial(parsed.data.material, parsed.data.fingerprintKey);
  const outcome = parsed.data.outcome;
  const inserted = await pool.query<IntentRow>(
    `insert into app.confirmation_intents (
       intent_id, operation_scope, intent_key, request_fingerprint, state,
       booking_id, outcome_code, outcome_projection, lifecycle_class, expires_at
     ) values (
       $1, $2, $3, $4, $5, nullif($6::text, '')::uuid, $7,
       case when $5 = 'COMMITTED'
            then jsonb_build_object('bookingId', $6::text, 'status', 'SCHEDULED')
            else jsonb_build_object('code', $7::text) end,
       case when $5 = 'COMMITTED' then 'BOOKING_TERMINAL_PII_BOUND' else 'REJECTED_BOUNDED' end,
       $8
     ) on conflict (operation_scope, intent_key) do nothing
     returning request_fingerprint as "requestFingerprint", state,
               booking_id as "bookingId", outcome_code as "outcomeCode"`,
    [
      randomUUID(),
      operationScope,
      parsed.data.intentKey,
      fingerprint,
      outcome.kind,
      outcome.kind === "COMMITTED" ? outcome.bookingId : null,
      outcome.kind === "COMMITTED" ? "BOOKING_CONFIRMED" : outcome.code,
      parsed.data.expiresAt,
    ],
  );
  if (inserted.rows[0]) {
    return { kind: "RECORDED", outcome };
  }

  const existing = await pool.query<IntentRow>(
    `select request_fingerprint as "requestFingerprint", state,
            booking_id as "bookingId", outcome_code as "outcomeCode"
     from app.confirmation_intents
     where operation_scope = $1 and intent_key = $2`,
    [operationScope, parsed.data.intentKey],
  );
  const row = existing.rows[0];
  if (!row) {
    throw new Error("Confirmation intent is invalid.");
  }
  if (!sameFingerprint(row.requestFingerprint, fingerprint)) {
    return { kind: "CONFLICT" };
  }

  return { kind: "REPLAY", outcome: rowOutcome(row) };
}
