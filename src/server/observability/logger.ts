import { randomUUID } from "node:crypto";

import { z } from "zod";

import { operationalClassifications } from "./classifications";

export { operationalClassifications } from "./classifications";

const errorClasses = ["VALIDATION", "AUTHENTICATION", "AUTHORIZATION", "CONFLICT", "TRANSIENT", "OVERLOAD", "INTERNAL"] as const;

const logEventSchema = z.object({
  event: z.enum(["OPERATION_STARTED", "OPERATION_COMPLETED"]),
  operation: z.enum(operationalClassifications),
  outcome: z.enum(["SUCCEEDED", "DENIED", "FAILED", "DEGRADED"]).optional(),
  errorClass: z.enum(errorClasses).optional(),
  correlationId: z.uuid(),
  attempt: z.number().int().min(1).max(5).optional(),
}).strict();

export type SafeLogEvent = z.input<typeof logEventSchema>;

export function createCorrelationId(candidate?: string): string {
  return z.uuid().safeParse(candidate).success ? candidate! : randomUUID();
}

export function serializeLogEvent(event: SafeLogEvent): string {
  const parsed = logEventSchema.safeParse(event);
  if (!parsed.success) throw new Error("Observability event is invalid.");
  return JSON.stringify(parsed.data);
}

export class SafeOperationalError extends Error {
  constructor(
    readonly errorClass: typeof errorClasses[number],
    readonly publicCode: string,
    readonly correlationId: string,
  ) {
    super("Operation unavailable.");
    Object.defineProperty(this, "errorClass", { enumerable: false });
  }

  toJSON() {
    return { code: this.publicCode, correlationId: this.correlationId };
  }
}
