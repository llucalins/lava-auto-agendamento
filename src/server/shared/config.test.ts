import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadServerConfig } from "./config-schema";

describe("loadServerConfig", () => {
  it("rejects a missing database URL without exposing configuration details", () => {
    expect(() => loadServerConfig({})).toThrow("Server configuration is invalid.");
    expect(() => loadServerConfig({})).not.toThrow(/DATABASE_URL|undefined/);
  });

  it("rejects a malformed or non-PostgreSQL database URL", () => {
    expect(() => loadServerConfig({ DATABASE_URL: "not-a-url" })).toThrow(
      "Server configuration is invalid.",
    );
    expect(() => loadServerConfig({ DATABASE_URL: "https://db.example.test" })).toThrow(
      "Server configuration is invalid.",
    );
  });

  it("returns only validated server configuration", () => {
    expect(
      loadServerConfig({
        DATABASE_URL: "postgresql://app:synthetic-password@db.example.test:5432/lava_auto",
        NEXT_PUBLIC_DATABASE_URL: "https://public.example.test",
      }),
    ).toEqual({
      databaseUrl: "postgresql://app:synthetic-password@db.example.test:5432/lava_auto",
    });
  });

  it("keeps the server boundary marked server-only", () => {
    const source = readFileSync(resolve(import.meta.dirname, "config.ts"), "utf8");

    expect(source).toContain('import "server-only"');
    expect(source).not.toContain("NEXT_PUBLIC_");
  });

  it("keeps the environment template free of public configuration and real credentials", () => {
    const template = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");

    expect(template).toContain("DATABASE_URL=postgresql://");
    expect(template).not.toContain("NEXT_PUBLIC_");
    expect(template).not.toMatch(/password=(?!change-me)/i);
  });
});
