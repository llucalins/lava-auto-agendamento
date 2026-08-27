import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createScheduledBooking } from "../../src/server/capabilities/booking-lifecycle/repository";
import {
  fingerprintConfirmationMaterial,
  recordConfirmationIntentOutcome,
} from "../../src/server/capabilities/booking-lifecycle/idempotency";
import { createIntegrationPool } from "../support/postgres";

const fingerprintKey = "test-only-confirmation-fingerprint-key";
const expiryTomorrow = () => new Date(Date.now() + 24 * 60 * 60_000);
const intentKey = () => `intent-key-${randomUUID().replace(/-/g, "")}`;

describe("confirmation intent model", () => {
  it("recognizes same-key replays, rejects material conflicts, and stores only a sanitized outcome", async () => {
    const pool = createIntegrationPool();
    const packageId = randomUUID();
    await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
    await pool.query(
      "insert into app.service_package_revisions values ($1, 1, 'Basic', null, 5000, 30, 'ACTIVE')",
      [packageId],
    );
    const booking = await createScheduledBooking(pool, {
      packageId,
      serviceStart: new Date("2026-10-07T12:00:00Z"),
      serviceMode: "PICKUP_REQUESTED",
      intendedPaymentMethod: "PIX",
    });
    const material = {
      packageId,
      serviceStart: new Date("2026-10-07T12:00:00Z"),
      serviceMode: "PICKUP_REQUESTED" as const,
      intendedPaymentMethod: "PIX" as const,
      fullName: "  Ana Silva  ",
      phoneWhatsapp: "+55 (83) 99999-0000",
      email: " ANA@EXAMPLE.TEST ",
      cpf: "123.456.789-01",
      vehicleModel: " Hatch ",
      licencePlate: "abc1d23",
      vehicleColor: " Blue ",
      pickupAddress: " Rua das Flores, 10 ",
    };

    expect(fingerprintConfirmationMaterial(material, fingerprintKey)).toBe(
      fingerprintConfirmationMaterial(
        { ...material, fullName: "Ana Silva", email: "ana@example.test", licencePlate: "ABC1D23" },
        fingerprintKey,
      ),
    );

    const command = {
      intentKey: intentKey(),
      material,
      fingerprintKey,
      outcome: { kind: "COMMITTED" as const, bookingId: booking.bookingId },
      expiresAt: expiryTomorrow(),
    };
    await expect(recordConfirmationIntentOutcome(pool, command)).resolves.toEqual({
      kind: "RECORDED",
      outcome: { kind: "COMMITTED", bookingId: booking.bookingId },
    });
    await expect(recordConfirmationIntentOutcome(pool, command)).resolves.toEqual({
      kind: "REPLAY",
      outcome: { kind: "COMMITTED", bookingId: booking.bookingId },
    });
    await expect(
      recordConfirmationIntentOutcome(pool, {
        ...command,
        material: { ...material, intendedPaymentMethod: "CASH" as const },
      }),
    ).resolves.toEqual({ kind: "CONFLICT" });

    const persisted = await pool.query<{
      lifecycle_class: string;
      outcome_projection: Record<string, string>;
      request_fingerprint: string;
    }>(
      "select lifecycle_class, request_fingerprint, outcome_projection from app.confirmation_intents where intent_key = $1",
      [command.intentKey],
    );
    expect(persisted.rows).toEqual([
      {
        lifecycle_class: "BOOKING_TERMINAL_PII_BOUND",
        request_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        outcome_projection: { bookingId: booking.bookingId, status: "SCHEDULED" },
      },
    ]);
    expect(JSON.stringify(persisted.rows[0])).not.toMatch(
      /Ana|123\.456|99999|example\.test|Hatch|ABC1D23|Flores/,
    );
    await expect(
      pool.query(
        `insert into app.confirmation_intents (
           intent_id, operation_scope, intent_key, request_fingerprint, state,
           lifecycle_class, outcome_code, outcome_projection, expires_at
         ) values (
           $1, 'public.booking.confirm', $2,
           repeat('a', 64), 'REJECTED', 'REJECTED_BOUNDED', 'CAPACITY_UNAVAILABLE',
           '{"customer":"must-not-persist"}'::jsonb, current_timestamp + interval '1 day'
         )`,
        [randomUUID(), intentKey()],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `insert into app.confirmation_intents (
           intent_id, operation_scope, intent_key, request_fingerprint, state,
           lifecycle_class, outcome_code, outcome_projection, expires_at
         ) values (
           $1, 'public.booking.confirm', $2,
           repeat('b', 64), 'REJECTED', 'REJECTED_BOUNDED', 'CAPACITY_UNAVAILABLE',
           '{"code":"CAPACITY_UNAVAILABLE"}'::jsonb, current_timestamp + interval '13 months'
         )`,
        [randomUUID(), intentKey()],
      ),
    ).rejects.toThrow();
    await pool.end();
  });

  it("persists a bounded rejected outcome without a booking or raw request", async () => {
    const pool = createIntegrationPool();
    const packageId = randomUUID();
    const rejectedIntentKey = intentKey();
    const material = {
      packageId,
      serviceStart: new Date("2026-10-08T12:00:00Z"),
      serviceMode: "DROP_OFF" as const,
      intendedPaymentMethod: "CASH" as const,
      fullName: "Bruno Souza",
      phoneWhatsapp: "83999991111",
      email: undefined,
      cpf: "98765432100",
      vehicleModel: "Sedan",
      licencePlate: "DEF2G34",
      vehicleColor: "Black",
      pickupAddress: undefined,
    };

    await expect(
      recordConfirmationIntentOutcome(pool, {
        intentKey: rejectedIntentKey,
        material,
        fingerprintKey,
        outcome: { kind: "REJECTED", code: "CAPACITY_UNAVAILABLE" },
        expiresAt: expiryTomorrow(),
      }),
    ).resolves.toEqual({
      kind: "RECORDED",
      outcome: { kind: "REJECTED", code: "CAPACITY_UNAVAILABLE" },
    });

    const persisted = await pool.query<{
      booking_id: string | null;
      lifecycle_class: string;
      outcome_projection: Record<string, string>;
    }>(
      "select booking_id, lifecycle_class, outcome_projection from app.confirmation_intents where intent_key = $1",
      [rejectedIntentKey],
    );
    expect(persisted.rows).toEqual([
      {
        booking_id: null,
        lifecycle_class: "REJECTED_BOUNDED",
        outcome_projection: { code: "CAPACITY_UNAVAILABLE" },
      },
    ]);
    await pool.end();
  });
});
