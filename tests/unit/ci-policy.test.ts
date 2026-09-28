import { describe, expect, it } from "vitest";

import { inspectCiPolicy } from "../../scripts/verify-ci-policy.mjs";

const valid = {
  packageJson: JSON.stringify({
    packageManager: "npm@11.17.0",
    engines: { node: "24.x", npm: "11.17.0" },
    scripts: {
      "test:browser": "node --env-file-if-exists=.env.local ./node_modules/@playwright/test/cli.js test --pass-with-no-tests",
    },
  }),
  packageLock: JSON.stringify({ lockfileVersion: 3, packages: { "": {} } }),
  npmrc: "ignore-scripts=true\n",
  workflow: `npm ci --ignore-scripts
npm.cmd config get ignore-scripts
npm audit signatures
DATABASE_URL: postgresql://lava_test:synthetic@localhost/lava_auto
MIGRATION_DATABASE_URL: postgresql://lava_migrator:synthetic@localhost/lava_auto
create database lava_auto_agendamento_chain_test owner lava_migrator;`,
  competingLocks: [],
};

describe("CI supply-chain policy", () => {
  it("accepts the pinned frozen-install and synthetic database contract", () => {
    expect(inspectCiPolicy(valid)).toEqual([]);
  });

  it("rejects an intentional fixture that enables scripts and omits migration-role separation", () => {
    expect(inspectCiPolicy({
      ...valid,
      npmrc: "ignore-scripts=false\n",
      workflow: "npm install\nDATABASE_URL: postgresql://lava_test:synthetic@localhost/lava_auto",
    })).toEqual(expect.arrayContaining([
      expect.stringMatching(/ignore-scripts/),
      expect.stringMatching(/frozen install/),
      expect.stringMatching(/migration database role/),
    ]));
  });

  it("rejects a missing or runtime-owned clean-chain database", () => {
    expect(inspectCiPolicy({
      ...valid,
      workflow: valid.workflow.replace(
        "create database lava_auto_agendamento_chain_test owner lava_migrator;",
        "create database lava_auto_agendamento_chain_test owner lava_test;",
      ),
    })).toEqual(expect.arrayContaining([expect.stringMatching(/clean-chain database/)]));
  });

  it("rejects a required local env file for browser tests", () => {
    expect(inspectCiPolicy({
      ...valid,
      packageJson: valid.packageJson.replace("--env-file-if-exists", "--env-file"),
    })).toEqual(expect.arrayContaining([expect.stringMatching(/optional local env file/)]));
  });
});
