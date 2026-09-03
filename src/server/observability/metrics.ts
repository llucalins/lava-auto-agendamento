import { z } from "zod";

import { operationalClassifications } from "./classifications";

const observationSchema = z.object({
  operation: z.enum(operationalClassifications),
  statusClass: z.enum(["2XX", "4XX", "5XX"]),
  durationMs: z.number().finite().nonnegative().max(60_000),
}).strict();

const durationBounds = [50, 100, 250, 1_000, 2_500, Number.POSITIVE_INFINITY];

export function createMetricsRegistry() {
  const series = new Map<string, {
    operation: typeof operationalClassifications[number];
    statusClass: "2XX" | "4XX" | "5XX";
    count: number;
    durationBuckets: number[];
  }>();

  return {
    observe(input: z.input<typeof observationSchema>) {
      const value = observationSchema.parse(input);
      const key = `${value.operation}:${value.statusClass}`;
      const current = series.get(key) ?? {
        operation: value.operation,
        statusClass: value.statusClass,
        count: 0,
        durationBuckets: durationBounds.map(() => 0),
      };
      current.count += 1;
      const bucket = durationBounds.findIndex((bound) => value.durationMs <= bound);
      current.durationBuckets[bucket] += 1;
      series.set(key, current);
    },
    snapshot() {
      return [...series.values()]
        .sort((left, right) => `${left.operation}:${left.statusClass}`.localeCompare(`${right.operation}:${right.statusClass}`))
        .map((value) => ({ ...value, durationBuckets: [...value.durationBuckets] }));
    },
  };
}
