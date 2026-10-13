import { describe, expect, it } from "vitest";

import { isPiiProcessingAllowed } from "./pii-processing-gate";

describe("PII processing gate", () => {
  it("allows synthetic local development but fails closed in production", () => {
    expect(isPiiProcessingAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(isPiiProcessingAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(isPiiProcessingAllowed({ NODE_ENV: "production", PII_PROCESSING_APPROVED: "false" })).toBe(false);
    expect(isPiiProcessingAllowed({ NODE_ENV: "production", PII_PROCESSING_APPROVED: "true" })).toBe(true);
  });
});
