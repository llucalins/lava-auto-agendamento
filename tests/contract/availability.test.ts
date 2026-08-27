import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  findSelectableStarts,
  parseAvailabilityRequest,
} from "../../src/server/capabilities/operating-calendar/availability";
import { createIntegrationPool } from "../support/postgres";

describe("public availability", () => {
  const packageId = "7c0e0bdc-32df-4f23-8c94-7ba2cc20b13b";

  it("accepts only unambiguous UTC instants, never browser-local wall-clock times", () => {
    expect(
      parseAvailabilityRequest({
        packageId,
        starts: ["2026-08-31T11:30:00Z"],
      }),
    ).toEqual({ packageId, starts: [new Date("2026-08-31T11:30:00Z")] });

    expect(() =>
      parseAvailabilityRequest({
        packageId,
        starts: ["2026-11-01T01:30:00"],
      }),
    ).toThrow("Availability request is invalid.");
  });

  it("queries current package duration and calendar revision without creating reservations", async () => {
    let sql = "";
    let values: readonly unknown[] = [];

    const available = await findSelectableStarts(
      {
        query: async (query: string, parameters: readonly unknown[]) => {
          sql = query;
          values = parameters;
          return {
            rows: [
              {
                start: new Date("2026-08-31T11:30:00Z"),
                end: new Date("2026-08-31T12:00:00Z"),
                packageRevision: 3,
                calendarRevision: 5,
              },
            ],
          };
        },
      },
      { packageId, starts: [new Date("2026-08-31T11:30:00Z")] },
    );

    expect(available).toEqual([
      {
        start: "2026-08-31T11:30:00.000Z",
        end: "2026-08-31T12:00:00.000Z",
        packageRevision: 3,
        calendarRevision: 5,
      },
    ]);
    expect(sql).toContain("r.duration_minutes");
    expect(sql).toContain("p.current_revision = r.revision");
    expect(sql).toContain("candidate.service_end <= window_end");
    expect(sql).toContain("unavailability.starts_at < candidate.service_end");
    expect(sql).not.toContain("insert into");
    expect(values).toEqual([packageId, ["2026-08-31T11:30:00.000Z"]]);
  });
});

describe("package-duration calendar bounds", () => {
  const packageId = randomUUID();

  it("requires the complete interval to fit, preserves half-open boundaries, and applies overrides", async () => {
    const pool = createIntegrationPool();
    await pool.query("insert into app.operating_calendar default values on conflict do nothing");
    await pool.query(
      "insert into app.calendar_recurring_windows values (0, '08:00', '12:00', 1) on conflict do nothing",
    );
    await pool.query("insert into app.service_packages values ($1, 1)", [packageId]);
    await pool.query(
      "insert into app.service_package_revisions values ($1, 1, 'Bounded', null, 0, 30, 'ACTIVE')",
      [packageId],
    );
    await pool.query(
      "insert into app.calendar_unavailability values ($1, $2, $3, 1)",
      [randomUUID(), "2026-09-06T14:00:00Z", "2026-09-06T14:30:00Z"],
    );
    await pool.query(
      "insert into app.calendar_overrides values ('2026-09-13', null, null, true, 1) on conflict do nothing",
    );
    await pool.query(
      "insert into app.calendar_overrides values ('2026-09-20', '09:00', '10:00', false, 1) on conflict do nothing",
    );

    const available = await findSelectableStarts(pool, {
      packageId,
      starts: [
        new Date("2026-09-06T13:30:00Z"),
        new Date("2026-09-06T14:00:00Z"),
        new Date("2026-09-06T14:30:00Z"),
        new Date("2026-09-06T14:45:00Z"),
        new Date("2026-09-13T14:30:00Z"),
        new Date("2026-09-20T12:30:00Z"),
        new Date("2026-09-20T14:00:00Z"),
      ],
    });

    expect(available.map(({ start }) => start)).toEqual([
      "2026-09-06T13:30:00.000Z",
      "2026-09-06T14:30:00.000Z",
      "2026-09-20T12:30:00.000Z",
    ]);
    await pool.end();
  });
});
