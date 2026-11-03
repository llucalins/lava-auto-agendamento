import { describe, expect, it } from "vitest";

import { inspectDevelopmentAudit } from "../../scripts/check-development-audit.mjs";

// Reviewed npm audit report from 2026-11-03, reduced to policy-relevant fields.
const report = {
  vulnerabilities: {
    "@eslint-community/eslint-utils": {"severity": "moderate", "via": ["eslint"], "nodes": ["node_modules/@eslint-community/eslint-utils", "node_modules/@next/eslint-plugin-next/node_modules/@eslint-community/eslint-utils"]},
    "@eslint/config-array": {"severity": "moderate", "via": ["minimatch"], "nodes": ["node_modules/@eslint/config-array"]},
    "@eslint/eslintrc": {"severity": "moderate", "via": ["minimatch"], "nodes": ["node_modules/@eslint/eslintrc"]},
    "@next/eslint-plugin-next": {"severity": "moderate", "via": ["@eslint-community/eslint-utils"], "nodes": ["node_modules/@next/eslint-plugin-next"]},
    "@typescript-eslint/eslint-plugin": {"severity": "moderate", "via": ["@typescript-eslint/parser", "@typescript-eslint/type-utils", "@typescript-eslint/utils", "eslint"], "nodes": ["node_modules/@typescript-eslint/eslint-plugin"]},
    "@typescript-eslint/parser": {"severity": "moderate", "via": ["@typescript-eslint/typescript-estree", "eslint"], "nodes": ["node_modules/@typescript-eslint/parser"]},
    "@typescript-eslint/type-utils": {"severity": "moderate", "via": ["@typescript-eslint/typescript-estree", "@typescript-eslint/utils", "eslint"], "nodes": ["node_modules/@typescript-eslint/type-utils"]},
    "@typescript-eslint/typescript-estree": {"severity": "moderate", "via": ["minimatch"], "nodes": ["node_modules/@typescript-eslint/typescript-estree"]},
    "@typescript-eslint/utils": {"severity": "moderate", "via": ["@eslint-community/eslint-utils", "@typescript-eslint/typescript-estree", "eslint"], "nodes": ["node_modules/@typescript-eslint/utils"]},
    "eslint": {"severity": "moderate", "via": ["@eslint-community/eslint-utils", "@eslint/config-array", "@eslint/eslintrc", "minimatch"], "nodes": ["node_modules/eslint"]},
    "eslint-config-next": {"severity": "moderate", "via": ["@next/eslint-plugin-next", "eslint", "eslint-plugin-import", "eslint-plugin-jsx-a11y", "eslint-plugin-react", "typescript-eslint"], "nodes": ["node_modules/eslint-config-next"]},
    "eslint-plugin-import": {"severity": "moderate", "via": ["minimatch"], "nodes": ["node_modules/eslint-config-next/node_modules/eslint-plugin-import"]},
    "eslint-plugin-jsx-a11y": {"severity": "moderate", "via": ["minimatch"], "nodes": ["node_modules/eslint-config-next/node_modules/eslint-plugin-jsx-a11y"]},
    "eslint-plugin-react": {"severity": "moderate", "via": ["minimatch"], "nodes": ["node_modules/eslint-config-next/node_modules/eslint-plugin-react"]},
    "glob": {"severity": "moderate", "via": [{"source": 1244013, "name": "glob", "dependency": "glob", "url": "https://github.com/advisories/GHSA-3g3m-2fjr-6pw4", "severity": "moderate", "range": ">=9.0.0 <=14.0.1"}, "minimatch"], "nodes": ["node_modules/glob"]},
    "minimatch": {"severity": "moderate", "via": [{"source": 1244012, "name": "minimatch", "dependency": "minimatch", "url": "https://github.com/advisories/GHSA-g3hv-75wg-m249", "severity": "moderate", "range": "<11.0.1"}], "nodes": ["node_modules/@eslint/config-array/node_modules/minimatch", "node_modules/@eslint/eslintrc/node_modules/minimatch", "node_modules/eslint-config-next/node_modules/minimatch", "node_modules/eslint/node_modules/minimatch", "node_modules/minimatch"]},
    "node-pg-migrate": {"severity": "moderate", "via": ["glob"], "nodes": ["node_modules/node-pg-migrate"]},
    "typescript-eslint": {"severity": "moderate", "via": ["@typescript-eslint/eslint-plugin", "@typescript-eslint/parser", "@typescript-eslint/typescript-estree", "@typescript-eslint/utils", "eslint"], "nodes": ["node_modules/typescript-eslint"]},
  },
};
const packageLock = {
  packages: {
    "node_modules/@eslint-community/eslint-utils": {"version": "4.10.1", "dev": true},
    "node_modules/@next/eslint-plugin-next/node_modules/@eslint-community/eslint-utils": {"version": "4.9.1", "dev": true},
    "node_modules/@eslint/config-array": {"version": "0.21.2", "dev": true},
    "node_modules/@eslint/eslintrc": {"version": "3.3.6", "dev": true},
    "node_modules/@next/eslint-plugin-next": {"version": "16.3.8", "dev": true},
    "node_modules/@typescript-eslint/eslint-plugin": {"version": "8.67.0", "dev": true},
    "node_modules/@typescript-eslint/parser": {"version": "8.67.0", "dev": true},
    "node_modules/@typescript-eslint/type-utils": {"version": "8.67.0", "dev": true},
    "node_modules/@typescript-eslint/typescript-estree": {"version": "8.67.0", "dev": true},
    "node_modules/@typescript-eslint/utils": {"version": "8.67.0", "dev": true},
    "node_modules/eslint": {"version": "9.39.5", "dev": true},
    "node_modules/eslint-config-next": {"version": "16.3.8", "dev": true},
    "node_modules/eslint-config-next/node_modules/eslint-plugin-import": {"version": "2.32.0", "dev": true},
    "node_modules/eslint-config-next/node_modules/eslint-plugin-jsx-a11y": {"version": "6.10.2", "dev": true},
    "node_modules/eslint-config-next/node_modules/eslint-plugin-react": {"version": "7.37.5", "dev": true},
    "node_modules/glob": {"version": "13.0.6"},
    "node_modules/@eslint/config-array/node_modules/minimatch": {"version": "3.1.5", "dev": true},
    "node_modules/@eslint/eslintrc/node_modules/minimatch": {"version": "3.1.5", "dev": true},
    "node_modules/eslint-config-next/node_modules/minimatch": {"version": "3.1.5", "dev": true},
    "node_modules/eslint/node_modules/minimatch": {"version": "3.1.5", "dev": true},
    "node_modules/minimatch": {"version": "10.2.6"},
    "node_modules/node-pg-migrate": {"version": "9.0.0"},
    "node_modules/typescript-eslint": {"version": "8.67.0", "dev": true},
  },
};
const reviewedAt = new Date("2026-11-03T00:00:00Z");

type Audit = { vulnerabilities: Record<string, { severity: string; via: (string | Record<string, unknown>)[]; nodes: string[] }> };
type Lock = { packages: Record<string, { version: string; dev?: boolean; devOptional?: boolean }> };

function inspect(mutate: (audit: Audit, lock: Lock) => void) {
  const audit = structuredClone(report);
  const lock = structuredClone(packageLock);
  mutate(audit, lock);
  return inspectDevelopmentAudit(audit, lock, reviewedAt);
}

describe("temporary glob and minimatch audit policy", () => {
  it("accepts the reviewed moderate findings with explicit production and dev paths", () => {
    expect(inspectDevelopmentAudit(report, packageLock, reviewedAt)).toEqual([]);
  });

  it("accepts a clean audit even after the exceptions expire", () => {
    expect(inspectDevelopmentAudit({ vulnerabilities: {} }, packageLock, new Date("2027-01-01"))).toEqual([]);
  });

  it.each(["high", "critical"])("blocks %s severity on every reviewed package", (severity) => {
    for (const name of Object.keys(report.vulnerabilities)) {
      expect(inspect((audit) => { audit.vulnerabilities[name].severity = severity; })).not.toEqual([]);
    }
  });

  it.each(["high", "critical"])("blocks an advisory upgraded to %s even if package severity stays moderate", (severity) => {
    expect(inspect((audit) => { (audit.vulnerabilities.minimatch.via[0] as Record<string, unknown>).severity = severity; })).not.toEqual([]);
  });

  it("blocks any new package, including a moderate dev dependency", () => {
    expect(inspect((audit, lock) => {
      audit.vulnerabilities.vite = { severity: "moderate", via: ["minimatch"], nodes: ["node_modules/vite"] };
      lock.packages["node_modules/vite"] = { version: "8.3.5", dev: true };
    })).not.toEqual([]);
  });

  it("blocks any new advisory on a reviewed package", () => {
    expect(inspect((audit) => {
      audit.vulnerabilities.minimatch.via.push({ ...audit.vulnerabilities.minimatch.via[0] as Record<string, unknown>, source: 999, url: "https://github.com/advisories/GHSA-new" });
    })).not.toEqual([]);
  });

  it("does not accept duplicate paths or edges in place of reviewed ones", () => {
    expect(inspect((audit) => {
      audit.vulnerabilities.minimatch.nodes[0] = audit.vulnerabilities.minimatch.nodes[1];
    })).not.toEqual([]);
    expect(inspect((audit) => { audit.vulnerabilities.glob.via = ["minimatch", "minimatch"]; })).not.toEqual([]);
  });

  it("rejects the retired braces exception", () => {
    expect(inspect((audit) => {
      audit.vulnerabilities.braces = {
        severity: "high", nodes: ["node_modules/braces"],
        via: [{ source: 1240992, url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm", severity: "high", range: "<=3.0.3" }],
      };
    })).not.toEqual([]);
  });

  it.each(["source", "url", "range", "name", "dependency"])("blocks changed advisory %s", (field) => {
    expect(inspect((audit) => { (audit.vulnerabilities.glob.via[0] as Record<string, unknown>)[field] = "unreviewed"; })).not.toEqual([]);
  });

  it("blocks unexpected dependency edges and missing advisories", () => {
    expect(inspect((audit) => { audit.vulnerabilities.glob.via = ["eslint"]; })).not.toEqual([]);
    expect(inspect((audit) => { audit.vulnerabilities.minimatch.via = []; })).not.toEqual([]);
  });

  it("blocks changed versions at every reviewed node, including nested packages", () => {
    for (const node of Object.keys(packageLock.packages)) {
      expect(inspect((_audit, lock) => { lock.packages[node].version = "99.0.0"; })).not.toEqual([]);
    }
  });

  it("blocks missing or additional audit paths", () => {
    expect(inspect((audit) => { audit.vulnerabilities.minimatch.nodes.pop(); })).not.toEqual([]);
    expect(inspect((audit) => { audit.vulnerabilities.minimatch.nodes.push("node_modules/other/node_modules/minimatch"); })).not.toEqual([]);
  });

  it("blocks missing lockfile nodes", () => {
    expect(inspect((_audit, lock) => { delete lock.packages["node_modules/glob"]; })).not.toEqual([]);
  });

  it("blocks reclassification in either direction for every node", () => {
    for (const node of Object.keys(packageLock.packages)) {
      expect(inspect((_audit, lock) => { lock.packages[node].dev = lock.packages[node].dev !== true; })).not.toEqual([]);
    }
  });

  it("blocks ambiguous devOptional classification for production nodes", () => {
    expect(inspect((_audit, lock) => { lock.packages["node_modules/node-pg-migrate"].devOptional = true; })).not.toEqual([]);
  });

  it("expires on the review date and afterwards", () => {
    for (const date of ["2026-11-13T00:00:00Z", "2026-11-14T00:00:00Z"]) {
      expect(inspectDevelopmentAudit(report, packageLock, new Date(date))).not.toEqual([]);
    }
  });

  it.each([undefined, {}, { vulnerabilities: null }, { vulnerabilities: [] }, { vulnerabilities: "invalid" }, { error: {}, vulnerabilities: {} }])("rejects invalid or errored reports: %j", (audit) => {
    expect(inspectDevelopmentAudit(audit, packageLock, reviewedAt)).not.toEqual([]);
  });

  it("rejects malformed finding fields without throwing", () => {
    for (const value of [null, {}, { severity: "moderate", via: null, nodes: null }]) {
      expect(inspectDevelopmentAudit({ vulnerabilities: { ...report.vulnerabilities, glob: value } }, packageLock, reviewedAt)).not.toEqual([]);
    }
  });

  it("rejects high or critical summary counts even with empty findings", () => {
    for (const severity of ["high", "critical"]) {
      expect(inspectDevelopmentAudit({ vulnerabilities: {}, metadata: { vulnerabilities: { [severity]: 1 } } }, packageLock, reviewedAt)).not.toEqual([]);
    }
  });
});
