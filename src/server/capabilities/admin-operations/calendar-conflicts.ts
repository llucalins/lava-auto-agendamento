import type { Pool, PoolClient } from "pg";

import { replaceCalendarInTransaction } from "./calendar-management";

const MAX_CONFLICTS = 50;

export type CalendarConflict = Readonly<{
  bookingId: string;
  revision: number;
  status: "SCHEDULED" | "IN_PROGRESS";
  serviceStart: string;
  serviceEnd: string;
  serviceDate: string;
  localStart: string;
  localEnd: string;
  businessTimezone: "America/Fortaleza";
}>;
export type GuardedCalendarResult =
  | Readonly<{
      kind: "CONFLICT_WITH_EXISTING_BOOKINGS";
      calendarRevision: number;
      conflictCount: number;
      conflicts: readonly CalendarConflict[];
    }>
  | Readonly<{
      kind: "APPLIED";
      calendarRevision: number;
      auditEventId: string;
      conflictsAcknowledged: number;
    }>;

type ConflictRow = Readonly<{
  bookingId: string;
  revision: number;
  status: "SCHEDULED" | "IN_PROGRESS";
  serviceStart: Date;
  serviceEnd: Date;
  serviceDate: string;
  localStart: string;
  localEnd: string;
  conflictCount: string;
}>;

export async function applyGuardedCalendar(
  pool: Pick<Pool, "connect">,
  sessionCookie: string,
  command: unknown,
  acknowledgeConflicts: boolean,
): Promise<GuardedCalendarResult> {
  if (typeof acknowledgeConflicts !== "boolean") throw new Error("Invalid calendar configuration");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await applyGuardedCalendarOnce(pool, sessionCookie, command, acknowledgeConflicts);
    } catch (error) {
      if (!isRetryable(error) || attempt === 2) throw error;
    }
  }
  throw new Error("Calendar update is unavailable");
}

async function applyGuardedCalendarOnce(
  pool: Pick<Pool, "connect">,
  sessionCookie: string,
  command: unknown,
  acknowledgeConflicts: boolean,
): Promise<GuardedCalendarResult> {
  const client = await pool.connect();
  try {
    await client.query("begin isolation level serializable");
    const mutation = await replaceCalendarInTransaction(
      client,
      sessionCookie,
      command,
      acknowledgeConflicts ? "CALENDAR_CONFLICTS_ACKNOWLEDGED" : "CALENDAR_RULES_REPLACED",
    );
    const previousRevision = mutation.revision - 1;
    const conflicts = await findNewConflicts(client, previousRevision, mutation.revision);
    const conflictCount = Number(conflicts[0]?.conflictCount ?? 0);

    if (conflictCount > 0 && !acknowledgeConflicts) {
      await client.query("rollback");
      return {
        kind: "CONFLICT_WITH_EXISTING_BOOKINGS",
        calendarRevision: previousRevision,
        conflictCount,
        conflicts: projectConflicts(conflicts),
      };
    }

    await client.query("commit");
    return {
      kind: "APPLIED",
      calendarRevision: mutation.revision,
      auditEventId: mutation.auditEventId,
      conflictsAcknowledged: acknowledgeConflicts ? conflictCount : 0,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function isRetryable(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && ["40001", "40P01"].includes(String((error as { code?: unknown }).code));
}

async function findNewConflicts(
  client: PoolClient,
  previousRevision: number,
  nextRevision: number,
): Promise<readonly ConflictRow[]> {
  const result = await client.query<ConflictRow>(
    `with versions(revision, version_name) as (
       values ($1::integer, 'PREVIOUS'::text), ($2::integer, 'NEXT'::text)
     ), evaluated as (
       select booking.booking_id, booking.revision as booking_revision, booking.status,
              booking.service_start, booking.service_end, version.version_name,
              exists (
                select 1
                from (
                  select override.starts_at, override.ends_at, override.is_closed
                  from app.calendar_overrides override
                  where override.revision = version.revision
                    and override.calendar_date = (booking.service_start at time zone calendar.timezone)::date
                  union all
                  select recurring.starts_at, recurring.ends_at, false
                  from app.calendar_recurring_windows recurring
                  where recurring.revision = version.revision
                    and recurring.weekday = extract(dow from (booking.service_start at time zone calendar.timezone)::date)::integer
                    and not exists (
                      select 1 from app.calendar_overrides override
                      where override.revision = version.revision
                        and override.calendar_date = (booking.service_start at time zone calendar.timezone)::date
                    )
                ) rule
                where rule.is_closed is not true
                  and booking.service_start >= (((booking.service_start at time zone calendar.timezone)::date + rule.starts_at) at time zone calendar.timezone)
                  and booking.service_end <= (((booking.service_start at time zone calendar.timezone)::date + rule.ends_at) at time zone calendar.timezone)
              ) and not exists (
                select 1 from app.calendar_unavailability unavailable
                where unavailable.revision = version.revision
                  and unavailable.starts_at < booking.service_end
                  and unavailable.ends_at > booking.service_start
              ) as eligible
       from app.bookings booking
       cross join app.operating_calendar calendar
       cross join versions version
       where booking.status in ('SCHEDULED', 'IN_PROGRESS')
     ), changed as (
       select booking_id, booking_revision, status, service_start, service_end
       from evaluated
       group by booking_id, booking_revision, status, service_start, service_end
       having bool_or(eligible) filter (where version_name = 'PREVIOUS')
          and not bool_or(eligible) filter (where version_name = 'NEXT')
     )
     select booking_id as "bookingId", booking_revision as revision, status,
            service_start as "serviceStart", service_end as "serviceEnd",
            to_char(service_start at time zone 'America/Fortaleza', 'YYYY-MM-DD') as "serviceDate",
            to_char(service_start at time zone 'America/Fortaleza', 'HH24:MI') as "localStart",
            to_char(service_end at time zone 'America/Fortaleza', 'HH24:MI') as "localEnd",
            count(*) over()::text as "conflictCount"
     from changed
     order by service_start, booking_id
     limit ${MAX_CONFLICTS}`,
    [previousRevision, nextRevision],
  );
  return result.rows;
}

function projectConflicts(rows: readonly ConflictRow[]): readonly CalendarConflict[] {
  return rows.map((row) => ({
    bookingId: row.bookingId,
    revision: row.revision,
    status: row.status,
    serviceStart: row.serviceStart.toISOString(),
    serviceEnd: row.serviceEnd.toISOString(),
    serviceDate: row.serviceDate,
    localStart: row.localStart,
    localEnd: row.localEnd,
    businessTimezone: "America/Fortaleza",
  }));
}
