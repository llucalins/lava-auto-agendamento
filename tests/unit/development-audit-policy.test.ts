import { describe, expect, it } from "vitest";

import { inspectDevelopmentAudit } from "../../scripts/check-development-audit.mjs";

const names = ["eslint-config-next", "@next/eslint-plugin-next", "fast-glob", "micromatch", "braces"];
const versions = new Map([
  ["eslint-config-next", "16.3.8"],
  ["@next/eslint-plugin-next", "16.3.8"],
  ["fast-glob", "3.3.1"],
  ["micromatch", "4.0.8"],
  ["braces", "3.0.3"],
]);
const chain = ["@next/eslint-plugin-next", "fast-glob", "micromatch", "braces"];
const report = {
  vulnerabilities: {
    "eslint-config-next": { severity: "high", via: [chain[0]] },
    "@next/eslint-plugin-next": { severity: "high", via: [chain[1]] },
    "fast-glob": { severity: "high", via: [chain[2]] },
    micromatch: { severity: "high", via: [chain[3]] },
    braces: {
      severity: "high",
      via: [{ source: 1240992, url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm", severity: "high", range: "<=3.0.3" }],
    },
  },
};
const packageLock = {
  packages: Object.fromEntries(names.map((name) => [`node_modules/${name}`, {
    dev: true,
    version: versions.get(name),
  }])),
};

describe("development dependency audit exception", () => {
  it("accepts a clean audit without requiring the exception", () => {
    expect(inspectDevelopmentAudit({ vulnerabilities: {} }, packageLock)).toEqual([]);
  });

  it("accepts only the reviewed, dev-only braces advisory chain before its review date", () => {
    expect(inspectDevelopmentAudit(report, packageLock, new Date("2026-10-13T00:00:00Z"))).toEqual([]);
  });

  it("blocks any additional vulnerability", () => {
    const expanded = { vulnerabilities: { ...report.vulnerabilities, next: { severity: "high", via: [] } } };
    expect(inspectDevelopmentAudit(expanded, packageLock, new Date("2026-10-13T00:00:00Z"))).toEqual(
      expect.arrayContaining([expect.stringMatching(/unexpected development audit findings/)]),
    );
  });

  it("blocks the exception once its review date is reached", () => {
    expect(inspectDevelopmentAudit(report, packageLock, new Date("2026-11-13T00:00:00Z"))).toEqual(
      expect.arrayContaining([expect.stringMatching(/exception has expired/)]),
    );
  });

  it("blocks if the reviewed chain becomes a production dependency", () => {
    const productionLock = {
      packages: { ...packageLock.packages, "node_modules/braces": { ...packageLock.packages["node_modules/braces"], dev: false } },
    };
    expect(inspectDevelopmentAudit(report, productionLock, new Date("2026-10-13T00:00:00Z"))).toEqual(
      expect.arrayContaining([expect.stringMatching(/not confirmed as development-only/)]),
    );
  });
});
