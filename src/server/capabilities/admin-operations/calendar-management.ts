import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { withTransaction } from "../../persistence/transaction";
import { resolveAuthorizedSession } from "../admin-access/authorization";
import { writeAuditEvent } from "../audit-trail/writer";
import { acquireCalendarConfirmationLock } from "../operating-calendar/coordination";

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const windowSchema = z.object({ start: timeSchema, end: timeSchema }).strict();
const weeklyDaySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  windows: z.array(windowSchema).max(8),
}).strict();
const overrideSchema = z.discriminatedUnion("kind", [
  z.object({ date: z.string(), kind: z.literal("CLOSED") }).strict(),
  z.object({ date: z.string(), kind: z.literal("OPEN"), windows: z.array(windowSchema).min(1).max(8) }).strict(),
]);
const unavailabilitySchema = z.object({
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
}).strict();
const calendarSchema = z.object({
  expectedRevision: z.number().int().min(1),
  weeklySchedule: z.array(weeklyDaySchema).max(7),
  overrides: z.array(overrideSchema).max(366),
  unavailability: z.array(unavailabilitySchema).max(500),
}).strict();

export type CalendarConfiguration = z.output<typeof calendarSchema>;
type CalendarInput = CalendarConfiguration;
type CalendarRow = Readonly<{ revision: number; timezone: string; calendarRef: string }>;
type RecurringRow = Readonly<{ weekday: number; start: string; end: string }>;
type OverrideRow = Readonly<{ date: string; start: string | null; end: string | null; isClosed: boolean }>;
type UnavailabilityRow = Readonly<{ start: Date; end: Date }>;
export type CalendarMutationResult = Readonly<{
  calendarRef: string;
  revision: number;
  timezone: "America/Fortaleza";
  auditEventId: string;
}>;

export async function replaceCalendar(
  pool: Pick<Pool, "connect">,
  sessionCookie: string,
  command: unknown,
): Promise<CalendarMutationResult> {
  return withTransaction(pool, (client) => replaceCalendarInTransaction(client, sessionCookie, command));
}

export async function getCalendarConfiguration(
  pool: Pick<Pool, "query">,
  sessionCookie: string,
): Promise<Readonly<{ calendarRef: string; timezone: "America/Fortaleza"; configuration: CalendarConfiguration }>> {
  if (!(await resolveAuthorizedSession(pool, sessionCookie, "CALENDAR_MANAGE"))) throw new Error("Forbidden");
  const calendarResult = await pool.query<CalendarRow>(
    `select revision, timezone, calendar_ref as "calendarRef"
     from app.operating_calendar where calendar_id = true`,
  );
  const calendar = calendarResult.rows[0];
  if (!calendar || calendar.timezone !== "America/Fortaleza") throw new Error("Invalid calendar configuration");
  const [recurring, overrides, unavailable] = await Promise.all([
    pool.query<RecurringRow>(
      `select weekday, to_char(starts_at, 'HH24:MI') as start, to_char(ends_at, 'HH24:MI') as end
       from app.calendar_recurring_windows where revision = $1 order by weekday, starts_at`,
      [calendar.revision],
    ),
    pool.query<OverrideRow>(
      `select calendar_date::text as date, to_char(starts_at, 'HH24:MI') as start,
              to_char(ends_at, 'HH24:MI') as end, is_closed as "isClosed"
       from app.calendar_overrides where revision = $1 order by calendar_date, starts_at nulls first`,
      [calendar.revision],
    ),
    pool.query<UnavailabilityRow>(
      `select starts_at as start, ends_at as end from app.calendar_unavailability
       where revision = $1 order by starts_at`,
      [calendar.revision],
    ),
  ]);
  const weeklySchedule = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    windows: recurring.rows.filter((row) => row.weekday === weekday).map(({ start, end }) => ({ start, end })),
  }));
  const overrideDates = [...new Set(overrides.rows.map((row) => row.date))];
  const projectedOverrides = overrideDates.map((date) => {
    const rows = overrides.rows.filter((row) => row.date === date);
    return rows.some((row) => row.isClosed)
      ? { date, kind: "CLOSED" as const }
      : { date, kind: "OPEN" as const, windows: rows.map((row) => ({ start: row.start!, end: row.end! })) };
  });
  return {
    calendarRef: calendar.calendarRef,
    timezone: "America/Fortaleza",
    configuration: {
      expectedRevision: calendar.revision,
      weeklySchedule,
      overrides: projectedOverrides,
      unavailability: unavailable.rows.map((row) => ({ start: row.start.toISOString(), end: row.end.toISOString() })),
    },
  };
}

export async function replaceCalendarInTransaction(
  client: PoolClient,
  sessionCookie: string,
  command: unknown,
  reasonCode: "CALENDAR_RULES_REPLACED" | "CALENDAR_CONFLICTS_ACKNOWLEDGED" = "CALENDAR_RULES_REPLACED",
): Promise<CalendarMutationResult> {
  const parsed = calendarSchema.safeParse(command);
  if (!parsed.success || !isValidConfiguration(parsed.data)) throw new Error("Invalid calendar configuration");
  const actor = await resolveAuthorizedSession(client, sessionCookie, "CALENDAR_MANAGE");
  if (!actor) throw new Error("Forbidden");

  await acquireCalendarConfirmationLock(client, "MUTATION");
  await client.query("insert into app.operating_calendar default values on conflict do nothing");
  const calendarResult = await client.query<CalendarRow>(
    `select revision, timezone, calendar_ref as "calendarRef"
     from app.operating_calendar where calendar_id = true for update`,
  );
  const calendar = calendarResult.rows[0];
  if (!calendar || calendar.timezone !== "America/Fortaleza") throw new Error("Invalid calendar configuration");
  if (calendar.revision !== parsed.data.expectedRevision) throw new Error("Stale calendar revision");
  const revision = calendar.revision + 1;

  await insertRules(client, revision, parsed.data);
  const updated = await client.query(
    "update app.operating_calendar set revision = $1 where calendar_id = true and revision = $2 returning calendar_id",
    [revision, calendar.revision],
  );
  if (updated.rows.length !== 1) throw new Error("Stale calendar revision");

  const auditEventId = await writeAuditEvent(client, {
    category: "CONFIGURATION_MUTATION",
    action: "CALENDAR_CONFIGURATION_REVISED",
    outcome: "SUCCEEDED",
    actorRef: actor.adminId,
    targetRef: calendar.calendarRef,
    reasonCode,
  });
  return {
    calendarRef: calendar.calendarRef,
    revision,
    timezone: "America/Fortaleza",
    auditEventId,
  };
}

async function insertRules(client: PoolClient, revision: number, input: CalendarInput): Promise<void> {
  for (const day of input.weeklySchedule) {
    for (const window of day.windows) {
      await client.query(
        "insert into app.calendar_recurring_windows (weekday, starts_at, ends_at, revision) values ($1, $2, $3, $4)",
        [day.weekday, window.start, window.end, revision],
      );
    }
  }
  for (const override of input.overrides) {
    if (override.kind === "CLOSED") {
      await client.query(
        "insert into app.calendar_overrides (override_id, calendar_date, starts_at, ends_at, is_closed, revision) values ($1, $2, null, null, true, $3)",
        [randomUUID(), override.date, revision],
      );
    } else {
      for (const window of override.windows) {
        await client.query(
          "insert into app.calendar_overrides (override_id, calendar_date, starts_at, ends_at, is_closed, revision) values ($1, $2, $3, $4, false, $5)",
          [randomUUID(), override.date, window.start, window.end, revision],
        );
      }
    }
  }
  for (const unavailable of input.unavailability) {
    await client.query(
      "insert into app.calendar_unavailability (unavailability_id, starts_at, ends_at, revision) values ($1, $2, $3, $4)",
      [randomUUID(), new Date(unavailable.start), new Date(unavailable.end), revision],
    );
  }
}

function isValidConfiguration(input: CalendarInput): boolean {
  if (new Set(input.weeklySchedule.map((day) => day.weekday)).size !== input.weeklySchedule.length) return false;
  if (new Set(input.overrides.map((override) => override.date)).size !== input.overrides.length) return false;
  for (const day of input.weeklySchedule) if (!validWindows(day.windows)) return false;
  for (const override of input.overrides) {
    if (!validDate(override.date)) return false;
    if (override.kind === "OPEN" && !validWindows(override.windows)) return false;
  }
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return input.unavailability.every((item) => {
    const start = new Date(item.start);
    const end = new Date(item.end);
    return start < end && localDate.format(start) === localDate.format(end);
  });
}

function validWindows(windows: readonly Readonly<{ start: string; end: string }>[]): boolean {
  const ordered = windows.map((window) => ({ start: minutes(window.start), end: minutes(window.end) }))
    .sort((left, right) => left.start - right.start);
  return ordered.every((window, index) => window.start < window.end && (index === 0 || ordered[index - 1]!.end <= window.start));
}

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour! * 60 + minute!;
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (year! < 2000 || year! > 2100) return false;
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}
