import { timingSafeEqual } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { allocateBookingCapacity } from "./allocations";
import {
  type ConfirmationMaterial,
  fingerprintConfirmationMaterial,
  recordConfirmationIntentOutcome,
} from "./idempotency";
import { persistBookingPii } from "./pii-repository";
import { createScheduledBooking } from "./repository";
import { findSelectableStarts } from "../operating-calendar/availability";
import { acquireCalendarConfirmationLock } from "../operating-calendar/coordination";
import { applyTransactionResourceLimits } from "../../security/resource-controls";

const operationScope = "public.booking.confirm";
const maxTransactionAttempts = 2;

const commandSchema = z.object({
  intentKey: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  fingerprintKey: z.string().min(32).max(1_024),
  expiresAt: z.date(),
});

export type ConfirmBookingCommand = Readonly<{
  intentKey: string;
  fingerprintKey: string;
  expiresAt: Date;
  material: ConfirmationMaterial;
}>;

export type ConfirmationResult =
  | Readonly<{ kind: "CONFIRMED"; bookingId: string; replayed: boolean }>
  | Readonly<{ kind: "REJECTED"; code: string; replayed: boolean }>
  | Readonly<{ kind: "IDEMPOTENCY_CONFLICT" }>
  | Readonly<{ kind: "TRANSIENT" }>;

type IntentRow = Readonly<{
  bookingId: string | null;
  outcomeCode: string;
  requestFingerprint: string;
  state: "COMMITTED" | "REJECTED";
}>;

type PostgresError = Readonly<{ code?: string }>;

function isPostgresError(error: unknown): error is PostgresError {
  return typeof error === "object" && error !== null && "code" in error;
}

function sameFingerprint(left: string, right: string): boolean {
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function storedResult(row: IntentRow, fingerprint: string): ConfirmationResult {
  if (!sameFingerprint(row.requestFingerprint, fingerprint)) {
    return { kind: "IDEMPOTENCY_CONFLICT" };
  }
  if (row.state === "COMMITTED" && row.bookingId) {
    return { kind: "CONFIRMED", bookingId: row.bookingId, replayed: true };
  }
  if (row.state === "REJECTED" && row.outcomeCode !== "BOOKING_CONFIRMED") {
    return { kind: "REJECTED", code: row.outcomeCode, replayed: true };
  }
  throw new Error("Confirmation is unavailable.");
}

async function recordRejected(
  client: PoolClient,
  command: ConfirmBookingCommand,
  code: "CAPACITY_UNAVAILABLE" | "STALE_PACKAGE" | "STALE_CALENDAR",
): Promise<ConfirmationResult> {
  const recorded = await recordConfirmationIntentOutcome(client, {
    ...command,
    outcome: { kind: "REJECTED", code },
  });
  if (recorded.kind === "CONFLICT") {
    return { kind: "IDEMPOTENCY_CONFLICT" };
  }
  if (recorded.outcome.kind !== "REJECTED") {
    throw new Error("Confirmation is unavailable.");
  }
  return { kind: "REJECTED", code: recorded.outcome.code, replayed: recorded.kind === "REPLAY" };
}

async function confirmInTransaction(
  pool: Pick<Pool, "connect">,
  command: ConfirmBookingCommand,
  fingerprint: string,
): Promise<ConfirmationResult> {
  const client = await pool.connect();

  try {
    await client.query("begin isolation level serializable");
    await applyTransactionResourceLimits(client);
    await acquireCalendarConfirmationLock(client, "CONFIRMATION");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${operationScope}:${command.intentKey}`,
    ]);
    const existing = await client.query<IntentRow>(
      `select request_fingerprint as "requestFingerprint", state,
              booking_id as "bookingId", outcome_code as "outcomeCode"
       from app.confirmation_intents
       where operation_scope = $1 and intent_key = $2`,
      [operationScope, command.intentKey],
    );
    if (existing.rows[0]) {
      const result = storedResult(existing.rows[0], fingerprint);
      await client.query("commit");
      return result;
    }

    const currentPackage = await client.query(
      `select p.package_id
       from app.service_packages p
       join app.service_package_revisions r
         on r.package_id = p.package_id and r.revision = p.current_revision
       where p.package_id = $1 and r.state = 'ACTIVE'`,
      [command.material.packageId],
    );
    if (currentPackage.rows.length !== 1) {
      const result = await recordRejected(client, command, "STALE_PACKAGE");
      await client.query("commit");
      return result;
    }
    const calendar = await client.query("select calendar_id from app.operating_calendar");
    if (calendar.rows.length !== 1) {
      const result = await recordRejected(client, command, "STALE_CALENDAR");
      await client.query("commit");
      return result;
    }
    const capacityUnits = await client.query(
      `select capacity_unit_id
       from app.capacity_units
       where state = 'ACTIVE'
       order by ordinal, capacity_unit_id`,
    );
    if (capacityUnits.rows.length === 0) {
      const result = await recordRejected(client, command, "CAPACITY_UNAVAILABLE");
      await client.query("commit");
      return result;
    }
    const selectable = await findSelectableStarts(client, {
      packageId: command.material.packageId,
      starts: [command.material.serviceStart],
    });
    if (!selectable.some((candidate) => candidate.start === command.material.serviceStart.toISOString())) {
      const result = await recordRejected(client, command, "STALE_CALENDAR");
      await client.query("commit");
      return result;
    }

    await client.query("savepoint confirmation_effects");
    try {
      const booking = await createScheduledBooking(client, {
        packageId: command.material.packageId,
        serviceStart: command.material.serviceStart,
        serviceMode: command.material.serviceMode,
        intendedPaymentMethod: command.material.intendedPaymentMethod,
      });
      const allocationId = await allocateBookingCapacity(client, booking.bookingId);
      if (!allocationId) {
        await client.query("rollback to savepoint confirmation_effects");
        const result = await recordRejected(client, command, "CAPACITY_UNAVAILABLE");
        await client.query("commit");
        return result;
      }
      await persistBookingPii(client, {
        bookingId: booking.bookingId,
        fullName: command.material.fullName,
        phoneWhatsapp: command.material.phoneWhatsapp,
        email: command.material.email,
        cpf: command.material.cpf,
        vehicleModel: command.material.vehicleModel,
        licencePlate: command.material.licencePlate,
        vehicleColor: command.material.vehicleColor,
        pickupAddress: command.material.pickupAddress,
      });
      const recorded = await recordConfirmationIntentOutcome(client, {
        ...command,
        outcome: { kind: "COMMITTED", bookingId: booking.bookingId },
      });
      if (recorded.kind !== "RECORDED" || recorded.outcome.kind !== "COMMITTED") {
        throw new Error("Confirmation is unavailable.");
      }
      await client.query("release savepoint confirmation_effects");
      await client.query("commit");
      return { kind: "CONFIRMED", bookingId: booking.bookingId, replayed: false };
    } catch (error) {
      await client.query("rollback to savepoint confirmation_effects");
      if (isPostgresError(error) && error.code === "23P01") {
        const result = await recordRejected(client, command, "CAPACITY_UNAVAILABLE");
        await client.query("commit");
        return result;
      }
      throw error;
    }
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function confirmBooking(
  pool: Pick<Pool, "connect">,
  command: ConfirmBookingCommand,
): Promise<ConfirmationResult> {
  const parsed = commandSchema.safeParse(command);
  if (!parsed.success || Number.isNaN(parsed.data.expiresAt.getTime())) {
    throw new Error("Confirmation request is invalid.");
  }

  let fingerprint: string;
  try {
    fingerprint = fingerprintConfirmationMaterial(command.material, command.fingerprintKey);
  } catch {
    throw new Error("Confirmation request is invalid.");
  }

  for (let attempt = 0; attempt < maxTransactionAttempts; attempt += 1) {
    try {
      return await confirmInTransaction(pool, command, fingerprint);
    } catch (error) {
      if (!isPostgresError(error) || !["40001", "40P01", "23505"].includes(error.code ?? "")) {
        throw new Error("Confirmation is unavailable.");
      }
    }
  }

  return { kind: "TRANSIENT" };
}
