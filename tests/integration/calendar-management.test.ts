import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import {
  replaceCalendar,
  replaceCalendarInTransaction,
} from "../../src/server/capabilities/admin-operations/calendar-management";
import { findSelectableStarts } from "../../src/server/capabilities/operating-calendar/availability";
import { withTransaction } from "../../src/server/persistence/transaction";

const pool = chainPool("DATABASE_URL");
const auditPool = chainPool("MIGRATION_DATABASE_URL");

afterAll(async () => { await Promise.all([pool.end(), auditPool.end()]); });

describe.sequential("PostgreSQL calendar administration", () => {
  it("allows only an OWNER to publish timezone-safe rules with durable audit and reconciled public revision", async () => {
    const owner = await createActor("OWNER");
    const employee = await createActor("EMPLOYEE");
    const expectedRevision = await currentRevision();
    const command = calendarCommand(expectedRevision);

    const changed = await replaceCalendar(pool, owner.cookieValue, command);
    expect(changed).toMatchObject({ revision: expectedRevision + 1, timezone: "America/Fortaleza" });

    const packageId = randomUUID();
    await pool.query("insert into app.service_packages (package_id, current_revision) values ($1, 1)", [packageId]);
    await pool.query("insert into app.service_package_revisions (package_id, revision, name, description, price_centavos, duration_minutes, state) values ($1, 1, 'Calendar probe', null, 0, 30, 'ACTIVE')", [packageId]);
    const selectable = await findSelectableStarts(pool, {
      packageId,
      starts: [
        new Date("2026-09-20T12:00:00Z"),
        new Date("2026-09-20T12:30:00Z"),
        new Date("2026-09-20T17:00:00Z"),
      ],
    });
    expect(selectable).toEqual([
      expect.objectContaining({ start: "2026-09-20T12:00:00.000Z", calendarRevision: changed.revision }),
      expect.objectContaining({ start: "2026-09-20T17:00:00.000Z", calendarRevision: changed.revision }),
    ]);

    const audit = await auditPool.query(
      "select action, outcome, actor_ref, target_ref, reason_code from app.audit_events where event_id = $1",
      [changed.auditEventId],
    );
    expect(audit.rows).toEqual([{
      action: "CALENDAR_CONFIGURATION_REVISED",
      outcome: "SUCCEEDED",
      actor_ref: owner.adminId,
      target_ref: changed.calendarRef,
      reason_code: "CALENDAR_RULES_REPLACED",
    }]);
    await expect(replaceCalendar(pool, employee.cookieValue, calendarCommand(changed.revision))).rejects.toThrow("Forbidden");
  });

  it("serializes concurrent writers and rejects a stale calendar revision", async () => {
    const owner = await createActor("OWNER");
    const expectedRevision = await currentRevision();
    const contenders = await Promise.allSettled([
      replaceCalendar(pool, owner.cookieValue, calendarCommand(expectedRevision)),
      replaceCalendar(pool, owner.cookieValue, calendarCommand(expectedRevision)),
    ]);
    expect(contenders.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(contenders.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(replaceCalendar(pool, owner.cookieValue, calendarCommand(expectedRevision))).rejects.toThrow("Stale calendar revision");
  });

  it("rolls back calendar rules, revision, and audit together", async () => {
    const owner = await createActor("OWNER");
    const before = await currentRevision();
    const auditBefore = await auditCount();

    await expect(withTransaction(pool, async (client) => {
      await replaceCalendarInTransaction(client, owner.cookieValue, calendarCommand(before));
      throw new Error("forced rollback");
    })).rejects.toThrow("forced rollback");

    expect(await currentRevision()).toBe(before);
    expect(await auditCount()).toBe(auditBefore);
  });

  it("rejects overlaps, cross-midnight windows, malformed dates, and cross-local-date unavailability", async () => {
    const owner = await createActor("OWNER");
    const revision = await currentRevision();
    const invalid = [
      { ...calendarCommand(revision), weeklySchedule: [{ weekday: 0, windows: [{ start: "08:00", end: "10:00" }, { start: "09:59", end: "11:00" }] }] },
      { ...calendarCommand(revision), weeklySchedule: [{ weekday: 0, windows: [{ start: "18:00", end: "09:00" }] }] },
      { ...calendarCommand(revision), overrides: [{ date: "2026-02-30", kind: "CLOSED" }] },
      { ...calendarCommand(revision), unavailability: [{ start: "2026-09-20T02:30:00Z", end: "2026-09-20T03:30:00Z" }] },
    ];
    for (const command of invalid) {
      await expect(replaceCalendar(pool, owner.cookieValue, command)).rejects.toThrow("Invalid calendar configuration");
    }
  });

  it("enforces half-open window integrity in PostgreSQL while allowing back-to-back windows", async () => {
    const revision = await currentRevision() + 10_000;
    await pool.query("insert into app.calendar_recurring_windows (weekday, starts_at, ends_at, revision) values (1, '08:00', '10:00', $1), (1, '10:00', '12:00', $1)", [revision]);
    await expect(pool.query(
      "insert into app.calendar_recurring_windows (weekday, starts_at, ends_at, revision) values (1, '09:59', '11:00', $1)",
      [revision],
    )).rejects.toThrow();

    const date = "2099-12-31";
    await pool.query("insert into app.calendar_overrides (override_id, calendar_date, starts_at, ends_at, is_closed, revision) values ($1, $2, '08:00', '10:00', false, $3)", [randomUUID(), date, revision]);
    await expect(pool.query(
      "insert into app.calendar_overrides (override_id, calendar_date, starts_at, ends_at, is_closed, revision) values ($1, $2, null, null, true, $3)",
      [randomUUID(), date, revision],
    )).rejects.toThrow();
  });
});

function calendarCommand(expectedRevision: number) {
  return {
    expectedRevision,
    weeklySchedule: [{ weekday: 0, windows: [{ start: "08:00", end: "10:00" }, { start: "13:00", end: "16:00" }] }],
    overrides: [{ date: "2026-09-20", kind: "OPEN" as const, windows: [{ start: "09:00", end: "10:00" }, { start: "14:00", end: "15:00" }] }],
    unavailability: [{ start: "2026-09-20T12:30:00Z", end: "2026-09-20T13:00:00Z" }],
  };
}

async function createActor(role: "OWNER" | "EMPLOYEE") {
  const adminId = randomUUID();
  const issuer = `https://${randomUUID()}.calendar.example.test`;
  await pool.query("insert into app.admin_identities (admin_id, issuer, subject, role) values ($1, $2, $3, $4)", [adminId, issuer, adminId, role]);
  return { adminId, ...(await createLocalSession(pool, { issuer, subject: adminId, mfaAssured: true })) };
}

async function currentRevision(): Promise<number> {
  await pool.query("insert into app.operating_calendar default values on conflict do nothing");
  const result = await pool.query<{ revision: number }>("select revision from app.operating_calendar where calendar_id = true");
  return result.rows[0]!.revision;
}

async function auditCount(): Promise<number> {
  const result = await auditPool.query<{ count: string }>("select count(*)::text as count from app.audit_events where action = 'CALENDAR_CONFIGURATION_REVISED'");
  return Number(result.rows[0]!.count);
}

function chainPool(variable: "DATABASE_URL" | "MIGRATION_DATABASE_URL"): Pool {
  const value = process.env[variable];
  if (!value) throw new Error(`${variable} is required for calendar integration tests.`);
  const url = new URL(value);
  url.pathname = "/lava_auto_agendamento_chain_test";
  return new Pool({ allowExitOnIdle: true, connectionString: url.toString(), max: 4 });
}
