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

  it("requires HTTPS, booking/tracking keys, and OIDC settings in production", () => {
    expect(() => loadServerConfig({ DATABASE_URL: "postgresql://app:secret@db.example.test/lava" }, true))
      .toThrow("Server configuration is invalid.");
    expect(() => loadServerConfig({
      DATABASE_URL: "postgresql://app:secret@db.example.test/lava",
      APP_ORIGIN: "http://app.example.test",
      CONFIRMATION_FINGERPRINT_KEY: "x".repeat(43),
      TRACKING_VERIFIER_KEY_VERSION: "1",
      TRACKING_VERIFIER_KEY: "y".repeat(43),
      OIDC_ISSUER: "https://id.example.test",
      OIDC_AUTHORIZATION_ENDPOINT: "https://id.example.test/authorize",
      OIDC_TOKEN_ENDPOINT: "https://id.example.test/token",
      OIDC_JWKS_URI: "https://id.example.test/jwks",
      OIDC_CLIENT_ID: "client",
      OIDC_REDIRECT_URI: "http://app.example.test/api/callback",
    }, true)).toThrow("Server configuration is invalid.");
  });

  it("accepts the minimum complete production configuration without returning secrets", () => {
    const config = loadServerConfig({
      DATABASE_URL: "postgresql://app:secret@db.example.test/lava",
      APP_ORIGIN: "https://app.example.test",
      CONFIRMATION_FINGERPRINT_KEY: "x".repeat(43),
      TRACKING_VERIFIER_KEY_VERSION: "1",
      TRACKING_VERIFIER_KEY: "y".repeat(43),
      OIDC_ISSUER: "https://id.example.test",
      OIDC_AUTHORIZATION_ENDPOINT: "https://id.example.test/authorize",
      OIDC_TOKEN_ENDPOINT: "https://id.example.test/token",
      OIDC_JWKS_URI: "https://id.example.test/jwks",
      OIDC_CLIENT_ID: "client",
      OIDC_REDIRECT_URI: "https://app.example.test/api/admin/auth/callback",
    }, true);
    expect(config).toEqual({ databaseUrl: "postgresql://app:secret@db.example.test/lava" });
    expect(JSON.stringify(config)).not.toContain("x".repeat(43));
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
