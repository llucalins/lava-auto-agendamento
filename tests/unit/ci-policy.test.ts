import { describe, expect, it } from "vitest";

import { inspectCiPolicy } from "../../scripts/verify-ci-policy.mjs";

const valid = {
  packageJson: JSON.stringify({ packageManager: "npm@11.17.0", engines: { node: "24.x", npm: "11.17.0" } }),
  packageLock: JSON.stringify({ lockfileVersion: 3, packages: { "": {} } }),
  npmrc: "ignore-scripts=true\n",
  workflow: `npm ci --ignore-scripts
npm.cmd config get ignore-scripts
npm audit signatures
DATABASE_URL: postgresql://lava_test:synthetic@localhost/lava_auto
MIGRATION_DATABASE_URL: postgresql://lava_migrator:synthetic@localhost/lava_auto`,
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
});
