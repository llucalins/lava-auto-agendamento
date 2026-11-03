import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Reviewed 2026-11-03: docs/security-dependencies-2026-11-03.md.
// These exceptions replace the withdrawn braces exception. They accept ONLY
// GHSA-3g3m-2fjr-6pw4 (glob cancellation bypass) and GHSA-g3hv-75wg-m249
// (minimatch pattern amplification), both moderate, on the exact nodes below.
// Residual risk: excessive filesystem I/O / CPU / memory from malicious glob
// patterns. Production installation includes node-pg-migrate -> glob -> minimatch;
// these are NOT dev-only. ESLint's reviewed nodes are development-only.
// Deferral: fixes require glob >=14.0.2 and minimatch >=11.0.1, outside the
// consumers' declared ranges. No forced upgrade, downgrade or reclassification.
// Review upstream backports by 2026-11-13; expiry blocks CI until reviewed.
const exceptionReviewBy = new Date("2026-11-13T00:00:00.000Z");
const globAdvisory = {
  source: 1244013, name: "glob", dependency: "glob", severity: "moderate",
  url: "https://github.com/advisories/GHSA-3g3m-2fjr-6pw4", range: ">=9.0.0 <=14.0.1",
};
const minimatchAdvisory = {
  source: 1244012, name: "minimatch", dependency: "minimatch", severity: "moderate",
  url: "https://github.com/advisories/GHSA-g3hv-75wg-m249", range: "<11.0.1",
};

// Each row fixes the dependency edges and every audit.nodes path, version and
// installation scope. Shared minimatch is production, even when used by ESLint.
const reviewedFindings = new Map([
  ["@eslint-community/eslint-utils", { via: ["eslint"], nodes: [["node_modules/@eslint-community/eslint-utils", "4.10.1", "development"], ["node_modules/@next/eslint-plugin-next/node_modules/@eslint-community/eslint-utils", "4.9.1", "development"]] }],
  ["@eslint/config-array", { via: ["minimatch"], nodes: [["node_modules/@eslint/config-array", "0.21.2", "development"]] }],
  ["@eslint/eslintrc", { via: ["minimatch"], nodes: [["node_modules/@eslint/eslintrc", "3.3.6", "development"]] }],
  ["@next/eslint-plugin-next", { via: ["@eslint-community/eslint-utils"], nodes: [["node_modules/@next/eslint-plugin-next", "16.3.8", "development"]] }],
  ["@typescript-eslint/eslint-plugin", { via: ["@typescript-eslint/parser", "@typescript-eslint/type-utils", "@typescript-eslint/utils", "eslint"], nodes: [["node_modules/@typescript-eslint/eslint-plugin", "8.67.0", "development"]] }],
  ["@typescript-eslint/parser", { via: ["@typescript-eslint/typescript-estree", "eslint"], nodes: [["node_modules/@typescript-eslint/parser", "8.67.0", "development"]] }],
  ["@typescript-eslint/type-utils", { via: ["@typescript-eslint/typescript-estree", "@typescript-eslint/utils", "eslint"], nodes: [["node_modules/@typescript-eslint/type-utils", "8.67.0", "development"]] }],
  ["@typescript-eslint/typescript-estree", { via: ["minimatch"], nodes: [["node_modules/@typescript-eslint/typescript-estree", "8.67.0", "development"]] }],
  ["@typescript-eslint/utils", { via: ["@eslint-community/eslint-utils", "@typescript-eslint/typescript-estree", "eslint"], nodes: [["node_modules/@typescript-eslint/utils", "8.67.0", "development"]] }],
  ["eslint", { via: ["@eslint-community/eslint-utils", "@eslint/config-array", "@eslint/eslintrc", "minimatch"], nodes: [["node_modules/eslint", "9.39.5", "development"]] }],
  ["eslint-config-next", { via: ["@next/eslint-plugin-next", "eslint", "eslint-plugin-import", "eslint-plugin-jsx-a11y", "eslint-plugin-react", "typescript-eslint"], nodes: [["node_modules/eslint-config-next", "16.3.8", "development"]] }],
  ["eslint-plugin-import", { via: ["minimatch"], nodes: [["node_modules/eslint-config-next/node_modules/eslint-plugin-import", "2.32.0", "development"]] }],
  ["eslint-plugin-jsx-a11y", { via: ["minimatch"], nodes: [["node_modules/eslint-config-next/node_modules/eslint-plugin-jsx-a11y", "6.10.2", "development"]] }],
  ["eslint-plugin-react", { via: ["minimatch"], nodes: [["node_modules/eslint-config-next/node_modules/eslint-plugin-react", "7.37.5", "development"]] }],
  ["glob", { via: [globAdvisory, "minimatch"], nodes: [["node_modules/glob", "13.0.6", "production"]] }],
  ["minimatch", { via: [minimatchAdvisory], nodes: [["node_modules/@eslint/config-array/node_modules/minimatch", "3.1.5", "development"], ["node_modules/@eslint/eslintrc/node_modules/minimatch", "3.1.5", "development"], ["node_modules/eslint-config-next/node_modules/minimatch", "3.1.5", "development"], ["node_modules/eslint/node_modules/minimatch", "3.1.5", "development"], ["node_modules/minimatch", "10.2.6", "production"]] }],
  ["node-pg-migrate", { via: ["glob"], nodes: [["node_modules/node-pg-migrate", "9.0.0", "production"]] }],
  ["typescript-eslint", { via: ["@typescript-eslint/eslint-plugin", "@typescript-eslint/parser", "@typescript-eslint/typescript-estree", "@typescript-eslint/utils", "eslint"], nodes: [["node_modules/typescript-eslint", "8.67.0", "development"]] }],
]);

function sameMembers(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && new Set(actual).size === actual.length
    && expected.every((item) => actual.includes(item));
}

function matchesVia(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const matches = (item, reviewed) => typeof reviewed === "string"
    ? item === reviewed
    : item !== null && typeof item === "object"
      && Object.entries(reviewed).every(([key, value]) => item[key] === value);
  // Require one-to-one matches: duplicates cannot replace a reviewed edge.
  return expected.every((reviewed) => actual.filter((item) => matches(item, reviewed)).length === 1);
}

export function inspectDevelopmentAudit(report, packageLock, now = new Date()) {
  const errors = [];
  const findings = report?.vulnerabilities;
  if (report?.error || !findings || typeof findings !== "object" || Array.isArray(findings)) {
    return ["npm audit returned an invalid or errored vulnerability report"];
  }
  if (report.metadata?.vulnerabilities?.high > 0 || report.metadata?.vulnerabilities?.critical > 0) {
    errors.push("high and critical vulnerabilities are forbidden in all installation scopes");
  }

  const actualNames = Object.keys(findings);
  if (actualNames.length === 0) return errors;
  if (!sameMembers(actualNames, [...reviewedFindings.keys()])) {
    errors.push(`unexpected audit findings: ${actualNames.sort().join(", ")}`);
  }
  if (!Number.isFinite(now.getTime()) || now >= exceptionReviewBy) {
    errors.push("the temporary glob/minimatch advisory exceptions have expired and require review");
  }

  for (const [name, vulnerability] of Object.entries(findings)) {
    if (vulnerability?.severity !== "moderate") errors.push(`${name} has an unexpected severity; only reviewed moderate findings are allowed`);
    const reviewed = reviewedFindings.get(name);
    if (!reviewed) continue;
    if (!matchesVia(vulnerability?.via, reviewed.via)) {
      errors.push(`${name} no longer matches the reviewed advisories and dependency edges`);
    }
    if (!sameMembers(vulnerability?.nodes, reviewed.nodes.map(([node]) => node))) {
      errors.push(`${name} no longer matches the reviewed installation paths`);
    }
    for (const [node, version, scope] of reviewed.nodes) {
      const entry = packageLock?.packages?.[node];
      if (!entry || entry.version !== version) errors.push(`${node} no longer matches the reviewed version ${version}`);
      const matchesScope = scope === "development"
        ? entry?.dev === true && entry?.devOptional !== true
        : entry && (entry.dev === undefined || entry.dev === false) && entry.devOptional !== true;
      if (!matchesScope) errors.push(`${node} is not confirmed as ${scope} in package-lock.json`);
    }
  }
  return errors;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const windows = process.platform === "win32";
  const command = windows ? (process.env.npm_execpath ? process.execPath : "cmd.exe") : "npm";
  const args = windows
    ? (process.env.npm_execpath ? [process.env.npm_execpath, "audit", "--json"] : ["/d", "/s", "/c", "npm.cmd audit --json"])
    : ["audit", "--json"];
  const audit = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    process.stderr.write("Development dependency audit did not return valid JSON.\n");
    process.exitCode = 1;
    return;
  }

  const packageLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  const errors = inspectDevelopmentAudit(report, packageLock);
  if (audit.error) errors.push("npm audit could not complete successfully");
  if (audit.status !== 0 && audit.status !== 1) errors.push("npm audit exited with an unexpected error status");
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`Development audit policy violation: ${error}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(Object.keys(report.vulnerabilities).length === 0
    ? "Development dependency audit is clean.\n"
    : "Dependency audit policy verified: only reviewed moderate glob/minimatch findings remain (production and development); review before 2026-11-13.\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
