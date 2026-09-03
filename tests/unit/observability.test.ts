import { describe, expect, it } from "vitest";

import {
  SafeOperationalError,
  createCorrelationId,
  operationalClassifications,
  serializeLogEvent,
} from "../../src/server/observability/logger";
import { createMetricsRegistry } from "../../src/server/observability/metrics";

describe("shared observability allowlist", () => {
  it("serializes only approved classifications and correlation metadata", () => {
    const correlationId = createCorrelationId();
    const serialized = serializeLogEvent({
      event: "OPERATION_COMPLETED",
      operation: "TRACKING_PROOF",
      outcome: "DENIED",
      errorClass: "AUTHORIZATION",
      correlationId,
    });
    expect(JSON.parse(serialized)).toEqual({
      event: "OPERATION_COMPLETED",
      operation: "TRACKING_PROOF",
      outcome: "DENIED",
      errorClass: "AUTHORIZATION",
      correlationId,
    });
  });

  it.each(["cpf", "address", "contact", "plate", "token", "oidcClaims", "headers", "body", "cookie", "url"])(
    "rejects prohibited %s fields instead of attempting redaction",
    (field) => {
      expect(() => serializeLogEvent({
        event: "OPERATION_COMPLETED",
        operation: "BOOKING_CONFIRMATION",
        outcome: "FAILED",
        correlationId: createCorrelationId(),
        [field]: "synthetic-sensitive-value",
      })).toThrow("Observability event is invalid");
    },
  );

  it("exposes only safe errors and creates server-controlled correlation IDs", () => {
    const supplied = "11111111-1111-4111-8111-111111111111";
    expect(createCorrelationId(supplied)).toBe(supplied);
    expect(createCorrelationId("attacker-value")).toMatch(/^[0-9a-f-]{36}$/);
    const error = new SafeOperationalError("TRANSIENT", "OPERATION_UNAVAILABLE", createCorrelationId());
    expect(error.message).toBe("Operation unavailable.");
    expect(JSON.stringify(error)).not.toContain("TRANSIENT");
  });

  it("uses one shared classification set for audit, confirmation, auth, disclosure, and tracking", () => {
    expect(operationalClassifications).toEqual(expect.arrayContaining([
      "AUDIT_WRITE", "BOOKING_CONFIRMATION", "AUTHENTICATION", "SENSITIVE_DISCLOSURE", "TRACKING_PROOF", "TRACKING_STATUS",
    ]));
  });

  it("records bounded-cardinality counters and duration histogram buckets", () => {
    const metrics = createMetricsRegistry();
    metrics.observe({ operation: "BOOKING_CONFIRMATION", statusClass: "2XX", durationMs: 120 });
    metrics.observe({ operation: "BOOKING_CONFIRMATION", statusClass: "5XX", durationMs: 2_700 });
    expect(metrics.snapshot()).toEqual([
      { operation: "BOOKING_CONFIRMATION", statusClass: "2XX", count: 1, durationBuckets: [0, 0, 1, 0, 0, 0] },
      { operation: "BOOKING_CONFIRMATION", statusClass: "5XX", count: 1, durationBuckets: [0, 0, 0, 0, 0, 1] },
    ]);
    expect(() => metrics.observe({ operation: "TRACKING_STATUS", statusClass: "2XX", durationMs: 1, url: "/tracking" } as never)).toThrow();
  });
});
