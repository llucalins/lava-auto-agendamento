import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function inspectCiPolicy(input) {
  const errors = [];
  const packageJson = JSON.parse(input.packageJson);
  const packageLock = JSON.parse(input.packageLock);
  if (packageJson.packageManager !== "npm@11.17.0" || packageJson.engines?.npm !== "11.17.0") {
    errors.push("package manager must be exactly npm@11.17.0");
  }
  if (packageJson.engines?.node !== "24.x") errors.push("Node must be pinned to the approved 24.x line");
  if (packageLock.lockfileVersion !== 3) errors.push("package-lock.json must use lockfileVersion 3");
  if (input.competingLocks.length > 0) errors.push("competing package-manager lockfiles are forbidden");
  if (!/^ignore-scripts=true$/m.test(input.npmrc)) errors.push("ignore-scripts must remain true");
  if (!input.workflow.includes("npm ci --ignore-scripts")) errors.push("CI must use the npm frozen install with scripts disabled");
  if (!input.workflow.includes("npm audit signatures")) errors.push("CI must verify registry signatures/provenance");
  if (!input.workflow.includes("MIGRATION_DATABASE_URL: postgresql://lava_migrator:")) {
    errors.push("CI must use a separate migration database role");
  }
  if (!input.workflow.includes("DATABASE_URL: postgresql://lava_test:")) {
    errors.push("CI must use the restricted runtime database role");
  }
  return errors;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const competingCandidates = ["yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb"];
  const competingLocks = [];
  for (const candidate of competingCandidates) {
    try {
      await access(path.join(root, candidate), constants.F_OK);
      competingLocks.push(candidate);
    } catch {}
  }
  const workflow = await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const errors = inspectCiPolicy({
    packageJson: await readFile(path.join(root, "package.json"), "utf8"),
    packageLock: await readFile(path.join(root, "package-lock.json"), "utf8"),
    npmrc: await readFile(path.join(root, ".npmrc"), "utf8"),
    workflow,
    competingLocks,
  });
  const actionRefs = [...workflow.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/g)].map((match) => match[1]);
  if (actionRefs.length === 0 || actionRefs.some((reference) => !/^[a-f0-9]{40}$/.test(reference))) {
    errors.push("every third-party action must be pinned to an immutable 40-character commit");
  }
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`CI policy violation: ${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("CI policy verified.\n");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
