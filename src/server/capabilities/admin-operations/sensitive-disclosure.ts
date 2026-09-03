import { createHash } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { writeDisclosureAuthorizationAudit } from "../audit-trail/writer";
import { withTransaction } from "../../persistence/transaction";

const sessionCookieSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const reasonSchema = z.string().trim().min(10).max(200).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const disclosureCommandSchema = z.object({
  bookingId: z.uuid(),
  field: z.enum(["CPF", "PICKUP_ADDRESS"]),
  purpose: z.literal("BOOKING_OPERATION"),
  reason: reasonSchema,
  correlationId: z.uuid(),
  requestId: z.uuid(),
}).strict();

export type SensitiveDisclosureCommand = z.input<typeof disclosureCommandSchema>;
export type SensitiveDisclosureAcceptance = Readonly<{
  bookingId: string;
  field: "CPF" | "PICKUP_ADDRESS";
  purpose: "BOOKING_OPERATION";
  correlationId: string;
  requestId: string;
  sessionId: string;
}>;
export type SensitiveDisclosure = Readonly<{ field: "CPF" | "PICKUP_ADDRESS"; value: string }>;

export class SensitiveDisclosureDeniedError extends Error {
  constructor() { super("Sensitive field is not accessible"); }
}

export class SensitiveDisclosureAuditUnavailableError extends Error {
  constructor() { super("Sensitive disclosure audit is unavailable"); }
}

type DisclosurePool = Pick<Pool, "connect">;
type InitialAuthorizationRow = Readonly<{ adminId: string; sessionId: string }>;
type SensitiveValueRow = Readonly<{ fieldRef: "CPF" | "PICKUP_ADDRESS"; fieldValue: string }>;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function discloseSensitiveField(
  pool: DisclosurePool,
  sessionCookie: string,
  command: SensitiveDisclosureCommand,
): Promise<SensitiveDisclosure> {
  const acceptance = await authorizeSensitiveDisclosure(pool, sessionCookie, command);
  const disclosed = await withTransaction(pool, (client) =>
    readAuthorizedSensitiveFieldInTransaction(client, sessionCookie, acceptance));
  if (!disclosed) throw new SensitiveDisclosureDeniedError();
  return disclosed;
}

export async function authorizeSensitiveDisclosure(
  pool: DisclosurePool,
  sessionCookie: string,
  command: SensitiveDisclosureCommand,
): Promise<SensitiveDisclosureAcceptance> {
  const cookie = sessionCookieSchema.parse(sessionCookie);
  const input = disclosureCommandSchema.parse(command);

  return withTransaction(pool, async (client) => {
    const authorized = await client.query<InitialAuthorizationRow>(
      `select identity.admin_id as "adminId", session.session_id as "sessionId"
       from app.admin_identities identity
       join app.admin_sessions session
         on session.issuer = identity.issuer and session.subject = identity.subject
       join app.bookings booking on booking.booking_id = $2
       where session.session_verifier_hash = $1
         and session.revoked_at is null
         and session.assurance = 'MFA'
         and session.assurance_expires_at > current_timestamp
         and session.idle_expires_at > current_timestamp
         and session.absolute_expires_at > current_timestamp
         and identity.account_state = 'ACTIVE'
         and session.authorization_version = identity.authorization_version
         and (($3 = 'CPF' and identity.role = 'OWNER')
           or ($3 = 'PICKUP_ADDRESS' and identity.role in ('OWNER', 'EMPLOYEE')))
       for share of identity, session, booking`,
      [digest(cookie), input.bookingId, input.field],
    );
    const context = authorized.rows[0];
    if (!context) throw new SensitiveDisclosureDeniedError();

    try {
      await writeDisclosureAuthorizationAudit(client, {
        actorRef: context.adminId,
        targetRef: input.bookingId,
        fieldRef: input.field,
        correlationId: input.correlationId,
        requestId: input.requestId,
        authorizationContextRef: context.sessionId,
        purpose: input.purpose,
      });
    } catch {
      throw new SensitiveDisclosureAuditUnavailableError();
    }

    return {
      bookingId: input.bookingId,
      field: input.field,
      purpose: input.purpose,
      correlationId: input.correlationId,
      requestId: input.requestId,
      sessionId: context.sessionId,
    };
  });
}

export async function readAuthorizedSensitiveFieldInTransaction(
  client: PoolClient,
  sessionCookie: string,
  acceptance: SensitiveDisclosureAcceptance,
): Promise<SensitiveDisclosure | undefined> {
  const cookie = sessionCookieSchema.parse(sessionCookie);
  const context = disclosureCommandSchema.omit({ reason: true }).extend({ sessionId: z.uuid() }).parse(acceptance);
  const result = await client.query<SensitiveValueRow>(
    `select field_ref as "fieldRef", field_value as "fieldValue"
     from app.read_authorized_sensitive_field($1, $2, $3, $4, $5, $6)`,
    [digest(cookie), context.bookingId, context.field, context.correlationId, context.requestId, context.purpose],
  );
  const row = result.rows[0];
  if (!row || (row.fieldRef !== "CPF" && row.fieldRef !== "PICKUP_ADDRESS") || typeof row.fieldValue !== "string") return undefined;
  return { field: row.fieldRef, value: row.fieldValue };
}
