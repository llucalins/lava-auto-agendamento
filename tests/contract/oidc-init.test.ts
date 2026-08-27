import { describe, expect, it } from "vitest";
import { createOidcLoginInitiation, consumeOidcLoginTransaction } from "../../src/server/capabilities/admin-access/oidc-init";

function fakePool() {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  return { calls, query: async <T extends Record<string, unknown> = Record<string, unknown>>(text: string, values: unknown[]) => { calls.push({ text, values }); return { rows: [{ stateVerifier: values[0], nonceVerifier: values[1], pkceVerifier: values[2], redirectTarget: values[3] } as unknown as T] }; } };
}

describe("OIDC login initiation", () => {
  it("creates bounded state, nonce and S256 PKCE without leaking them to persistence logs", async () => {
    const pool = fakePool();
    const result = await createOidcLoginInitiation(pool, { issuer: "https://id.example.test", authorizationEndpoint: "https://id.example.test/authorize", clientId: "lava-admin", redirectUri: "https://lava.example.test/auth/callback", allowedOrigin: "https://lava.example.test", requestOrigin: "https://lava.example.test" });
    expect(result.authorizationUrl).toContain("response_type=code");
    expect(result.authorizationUrl).toContain("code_challenge_method=S256");
    expect(new URL(result.authorizationUrl).searchParams.get("redirect_uri")).toBe("https://lava.example.test/auth/callback");
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0].text).toContain("insert into app.oidc_login_transactions");
    expect(pool.calls[0].values).toHaveLength(4);
    expect(pool.calls[0].values.every((value) => typeof value === "string")).toBe(true);
  });

  it("rejects cross-origin requests and non-allowlisted redirects", async () => {
    const pool = fakePool();
    await expect(createOidcLoginInitiation(pool, { issuer: "https://id.example.test", authorizationEndpoint: "https://id.example.test/authorize", clientId: "lava-admin", redirectUri: "https://evil.example.test/callback", allowedOrigin: "https://lava.example.test", requestOrigin: "https://lava.example.test" })).rejects.toThrow("OIDC login request is invalid.");
    await expect(createOidcLoginInitiation(pool, { issuer: "https://id.example.test", authorizationEndpoint: "https://id.example.test/authorize", clientId: "lava-admin", redirectUri: "https://lava.example.test/auth/callback", allowedOrigin: "https://lava.example.test", requestOrigin: "https://evil.example.test" })).rejects.toThrow("OIDC login request is invalid.");
  });

  it("consumes a transaction only once", async () => {
    let calls = 0;
    const pool = { query: async <T extends Record<string, unknown> = Record<string, unknown>>() => { calls += 1; return { rows: (calls === 1 ? [{ stateVerifier: "s", nonceVerifier: "n", pkceVerifier: "p", redirectTarget: "https://lava.example.test/auth/callback" }] : []) as unknown as T[] }; } };
    const state = "s".repeat(43);
    expect(await consumeOidcLoginTransaction(pool, state)).toEqual({ stateVerifier: "s", nonceVerifier: "n", pkceVerifier: "p", redirectTarget: "https://lava.example.test/auth/callback" });
    expect(await consumeOidcLoginTransaction(pool, state)).toBeNull();
  });
});
