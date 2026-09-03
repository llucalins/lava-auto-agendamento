import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import { applyGuardedCalendar } from "../../src/server/capabilities/admin-operations/calendar-conflicts";
import { replaceCalendar } from "../../src/server/capabilities/admin-operations/calendar-management";
import { confirmBooking } from "../../src/server/capabilities/booking-lifecycle/confirm";
import { createScheduledBooking } from "../../src/server/capabilities/booking-lifecycle/repository";

const pool = chainPool("DATABASE_URL");
const auditPool = chainPool("MIGRATION_DATABASE_URL");
afterAll(async () => { await Promise.all([pool.end(), auditPool.end()]); });

describe.sequential("guarded PostgreSQL calendar conflicts", () => {
  it("returns a bounded conflict without changing state, then preserves bookings on explicit acknowledged application", async () => {
    const owner = await createOwner();
    const opened = await publishOpenCalendar(owner.cookieValue);
    const packageId = await createPackage();
    const date = uniqueDate();
    const booking = await createScheduledBooking(pool, {
      packageId,
      serviceStart: new Date(`${date}T12:00:00Z`),
      serviceMode: "DROP_OFF",
      intendedPaymentMethod: "PIX",
    });
    const auditBefore = await calendarAuditCount();
    const close = configuration(opened.revision, [date]);

    const preview = await applyGuardedCalendar(pool, owner.cookieValue, close, false);
    expect(preview).toMatchObject({
      kind: "CONFLICT_WITH_EXISTING_BOOKINGS",
      calendarRevision: opened.revision,
      conflictCount: expect.any(Number),
    });
    if (preview.kind !== "CONFLICT_WITH_EXISTING_BOOKINGS") throw new Error("Expected conflict");
    expect(preview.conflicts).toContainEqual(expect.objectContaining({ bookingId: booking.bookingId, status: "SCHEDULED" }));
    expect(preview.conflicts.length).toBeLessThanOrEqual(50);
    expect(await currentRevision()).toBe(opened.revision);
    expect(await calendarAuditCount()).toBe(auditBefore);

    const applied = await applyGuardedCalendar(pool, owner.cookieValue, close, true);
    expect(applied).toMatchObject({ kind: "APPLIED", calendarRevision: opened.revision + 1 });
    const unchanged = await pool.query("select revision, status from app.bookings where booking_id = $1", [booking.bookingId]);
    expect(unchanged.rows).toEqual([{ revision: 1, status: "SCHEDULED" }]);
    const audit = await auditPool.query("select reason_code from app.audit_events where event_id = $1", [applied.kind === "APPLIED" ? applied.auditEventId : null]);
    expect(audit.rows).toEqual([{ reason_code: "CALENDAR_CONFLICTS_ACKNOWLEDGED" }]);
  });

  it("caps the authorized conflict projection while retaining the authoritative total", async () => {
    const owner = await createOwner();
    const opened = await publishOpenCalendar(owner.cookieValue);
    const packageId = await createPackage();
    const dates = Array.from({ length: 51 }, (_, index) => dateFrom("2060-01-01", index));
    for (const date of dates) {
      await createScheduledBooking(pool, {
        packageId,
        serviceStart: new Date(`${date}T12:00:00Z`),
        serviceMode: "DROP_OFF",
        intendedPaymentMethod: "CASH",
      });
    }

    const result = await applyGuardedCalendar(pool, owner.cookieValue, configuration(opened.revision, dates), false);
    expect(result.kind).toBe("CONFLICT_WITH_EXISTING_BOOKINGS");
    if (result.kind !== "CONFLICT_WITH_EXISTING_BOOKINGS") throw new Error("Expected conflict");
    expect(result.conflictCount).toBeGreaterThanOrEqual(51);
    expect(result.conflicts).toHaveLength(50);
    expect(await currentRevision()).toBe(opened.revision);
  });

  it("serializes confirmation against calendar publication so they cannot both commit contradictory state", async () => {
    const owner = await createOwner();
    const opened = await publishOpenCalendar(owner.cookieValue);
    const packageId = await createPackage();
    const date = uniqueDate();
    const request = confirmationCommand(packageId, new Date(`${date}T12:00:00Z`));
    const [confirmationResult, calendarResult] = await Promise.all([
      confirmBooking(pool, request),
      applyGuardedCalendar(pool, owner.cookieValue, configuration(opened.revision, [date]), false),
    ]);

    if (confirmationResult.kind === "CONFIRMED") {
      expect(calendarResult.kind).toBe("CONFLICT_WITH_EXISTING_BOOKINGS");
      expect(await currentRevision()).toBe(opened.revision);
    } else {
      expect(calendarResult.kind).toBe("APPLIED");
      expect(confirmationResult).toMatchObject({ kind: "REJECTED", code: "STALE_CALENDAR" });
    }
  });
});

async function publishOpenCalendar(sessionCookie: string) {
  return replaceCalendar(pool, sessionCookie, configuration(await currentRevision(), []));
}

function configuration(expectedRevision: number, closedDates: readonly string[]) {
  return {
    expectedRevision,
    weeklySchedule: Array.from({ length: 7 }, (_, weekday) => ({ weekday, windows: [{ start: "00:00", end: "23:59" }] })),
    overrides: closedDates.map((date) => ({ date, kind: "CLOSED" as const })),
    unavailability: [],
  };
}

async function createOwner() {
  const adminId = randomUUID();
  const issuer = `https://${randomUUID()}.conflicts.example.test`;
  await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, $3, 'OWNER')", [adminId, issuer, adminId]);
  return createLocalSession(pool, { issuer, subject: adminId, mfaAssured: true });
}

async function createPackage(): Promise<string> {
  const packageId = randomUUID();
  await pool.query("insert into app.service_packages (package_id, current_revision) values ($1, 1)", [packageId]);
  await pool.query("insert into app.service_package_revisions (package_id, revision, name, description, price_centavos, duration_minutes, state) values ($1, 1, 'Conflict probe', null, 0, 30, 'ACTIVE')", [packageId]);
  return packageId;
}

function confirmationCommand(packageId: string, serviceStart: Date) {
  return {
    intentKey: `intent-${randomUUID().replace(/-/g, "")}`,
    fingerprintKey: "calendar-conflict-test-fingerprint-key",
    expiresAt: new Date(Date.now() + 60_000),
    material: {
      packageId,
      serviceStart,
      serviceMode: "DROP_OFF" as const,
      intendedPaymentMethod: "PIX" as const,
      fullName: "Synthetic Customer",
      phoneWhatsapp: "83999990000",
      email: undefined,
      cpf: "12345678901",
      vehicleModel: "Synthetic hatch",
      licencePlate: "TST1A23",
      vehicleColor: "Blue",
      pickupAddress: undefined,
    },
  };
}

async function currentRevision(): Promise<number> {
  await pool.query("insert into app.operating_calendar default values on conflict do nothing");
  const result = await pool.query<{ revision: number }>("select revision from app.operating_calendar where calendar_id = true");
  return result.rows[0]!.revision;
}

async function calendarAuditCount(): Promise<number> {
  const result = await auditPool.query<{ count: string }>("select count(*)::text as count from app.audit_events where action = 'CALENDAR_CONFIGURATION_REVISED'");
  return Number(result.rows[0]!.count);
}

function uniqueDate(): string {
  const offset = Number.parseInt(randomUUID().slice(0, 8), 16) % 5_000;
  return dateFrom("2070-01-01", offset);
}

function dateFrom(base: string, offsetDays: number): string {
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function chainPool(variable: "DATABASE_URL" | "MIGRATION_DATABASE_URL"): Pool {
  const value = process.env[variable];
  if (!value) throw new Error(`${variable} is required for calendar conflict tests.`);
  const url = new URL(value);
  url.pathname = "/lava_auto_agendamento_chain_test";
  return new Pool({ allowExitOnIdle: true, connectionString: url.toString(), max: 8 });
}
