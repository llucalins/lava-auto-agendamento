import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exceptionReviewBy = new Date("2026-11-13T00:00:00.000Z");
const expectedFindings = new Set([
  "eslint-config-next",
  "@next/eslint-plugin-next",
  "fast-glob",
  "micromatch",
  "braces",
]);
const expectedVersions = new Map([
  ["eslint-config-next", "16.3.8"],
  ["@next/eslint-plugin-next", "16.3.8"],
  ["fast-glob", "3.3.1"],
  ["micromatch", "4.0.8"],
  ["braces", "3.0.3"],
]);
const dependencyChain = new Map([
  ["eslint-config-next", "@next/eslint-plugin-next"],
  ["@next/eslint-plugin-next", "fast-glob"],
  ["fast-glob", "micromatch"],
  ["micromatch", "braces"],
]);
const advisoryUrl = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";

export function inspectDevelopmentAudit(report, packageLock, now = new Date()) {
  const errors = [];
  const findings = report?.vulnerabilities;
  if (!findings || typeof findings !== "object") return ["npm audit returned no vulnerability report"];

  const actualNames = Object.keys(findings);
  if (actualNames.length === 0) return [];
  if (actualNames.length !== expectedFindings.size || actualNames.some((name) => !expectedFindings.has(name))) {
    errors.push(`unexpected development audit findings: ${actualNames.sort().join(", ") || "none"}`);
  }
  if (now >= exceptionReviewBy) errors.push("the temporary braces advisory exception has expired and requires review");

  for (const [name, vulnerability] of Object.entries(findings)) {
    if (vulnerability.severity !== "high") errors.push(`${name} has an unexpected severity`);
    const lockEntry = packageLock?.packages?.[`node_modules/${name}`];
    if (lockEntry?.dev !== true) errors.push(`${name} is not confirmed as development-only in package-lock.json`);
    if (lockEntry?.version !== expectedVersions.get(name)) errors.push(`${name} no longer matches the reviewed version`);

    const expectedDependency = dependencyChain.get(name);
    if (expectedDependency) {
      if (vulnerability.via?.length !== 1 || vulnerability.via[0] !== expectedDependency) {
        errors.push(`${name} is no longer connected only through the reviewed dependency chain`);
      }
    } else if (name === "braces") {
      const advisory = vulnerability.via?.filter((item) => typeof item === "object") ?? [];
      if (lockEntry?.version !== "3.0.3"
          || advisory.length !== 1
          || advisory[0]?.url !== advisoryUrl
          || advisory[0]?.source !== 1240992
          || advisory[0]?.severity !== "high"
          || advisory[0]?.range !== "<=3.0.3") {
        errors.push("braces no longer matches the reviewed GHSA-vfj7-8cjw-p6xm finding at 3.0.3");
      }
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
    : "Development audit policy verified: only the time-limited, dev-only braces advisory chain remains.\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
