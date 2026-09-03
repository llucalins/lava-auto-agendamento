import { z } from "zod";

import { assertBoundedDateWindow } from "../../security/resource-controls";

const MAX_CANDIDATES = 32;

const requestSchema = z.object({
  packageId: z.uuid(),
  starts: z.array(z.string()).min(1).max(MAX_CANDIDATES),
});

export type AvailabilityRequest = Readonly<{
  packageId: string;
  starts: readonly Date[];
}>;

type AvailabilityRow = Readonly<{
  start: Date;
  end: Date;
  packageRevision: number;
  calendarRevision: number;
}>;

type AvailabilityDatabase = Readonly<{
  query: (
    query: string,
    values: unknown[],
  ) => Promise<Readonly<{ rows: AvailabilityRow[] }>>;
}>;

export type SelectableStart = Readonly<{
  start: string;
  end: string;
  packageRevision: number;
  calendarRevision: number;
}>;

export function parseAvailabilityRequest(input: unknown): AvailabilityRequest {
  const parsed = requestSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error("Availability request is invalid.");
  }

  const starts = parsed.data.starts.map((value) => {
    if (!value.endsWith("Z")) {
      throw new Error("Availability request is invalid.");
    }

    const instant = new Date(value);
    if (Number.isNaN(instant.getTime())) {
      throw new Error("Availability request is invalid.");
    }

    return instant;
  });

  const ordered = [...starts].sort((left, right) => left.getTime() - right.getTime());
  assertBoundedDateWindow(ordered[0]!, ordered.at(-1)!, 31);

  return { packageId: parsed.data.packageId, starts };
}

export async function findSelectableStarts(
  pool: AvailabilityDatabase,
  request: AvailabilityRequest,
): Promise<SelectableStart[]> {
  const result = await pool.query(
    `with selected_package as (
       select r.duration_minutes, r.revision as package_revision
       from app.service_packages p
       join app.service_package_revisions r
         on p.package_id = r.package_id and p.current_revision = r.revision
       where p.package_id = $1 and r.state = 'ACTIVE'
     ), candidate_inputs as (
       select input.start
       from unnest($2::timestamptz[]) as input(start)
     ), candidate as (
       select input.start,
              input.start + make_interval(mins => package.duration_minutes) as service_end,
              package.package_revision,
              calendar.revision as calendar_revision,
              calendar.timezone,
              (input.start at time zone calendar.timezone)::date as local_date
       from candidate_inputs input
       cross join selected_package package
       cross join app.operating_calendar calendar
     ), resolved_window as (
       select candidate.*, rule.starts_at, rule.ends_at, rule.is_closed
       from candidate
       cross join lateral (
         select override.starts_at, override.ends_at, override.is_closed
         from app.calendar_overrides override
         where override.calendar_date = candidate.local_date
           and override.revision = candidate.calendar_revision
         union all
         select recurring.starts_at, recurring.ends_at, false
         from app.calendar_recurring_windows recurring
         where recurring.weekday = extract(dow from candidate.local_date)::integer
           and recurring.revision = candidate.calendar_revision
           and not exists (
             select 1 from app.calendar_overrides override
             where override.calendar_date = candidate.local_date
               and override.revision = candidate.calendar_revision
           )
       ) rule
     ), window_bounds as (
       select *,
              (local_date + starts_at) at time zone timezone as window_start,
              (local_date + ends_at) at time zone timezone as window_end
       from resolved_window
       where is_closed is not true and starts_at is not null and ends_at is not null
     )
     select candidate.start, candidate.service_end as "end",
            candidate.package_revision as "packageRevision",
            candidate.calendar_revision as "calendarRevision"
     from window_bounds candidate
     where candidate.service_end <= window_end
       and candidate.start >= window_start
       and candidate.local_date = (candidate.service_end at time zone candidate.timezone)::date
       and not exists (
         select 1
         from app.calendar_unavailability unavailability
         where unavailability.revision = candidate.calendar_revision
           and unavailability.starts_at < candidate.service_end
           and unavailability.ends_at > candidate.start
       )
     order by candidate.start`,
    [
      request.packageId,
      request.starts.map((start) => start.toISOString()),
    ],
  );

  return result.rows.map((row) => ({
    start: row.start.toISOString(),
    end: row.end.toISOString(),
    packageRevision: row.packageRevision,
    calendarRevision: row.calendarRevision,
  }));
}
