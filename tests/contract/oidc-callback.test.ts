import { generateKeyPairSync, createSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateOidcCallback } from "../../src/server/capabilities/admin-access/oidc-callback";

describe("OIDC callback validation", () => {
  it("validates the signed claim set and mandatory MFA assurance", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }) as { kty: string; n: string; e: string };
    const state = "s".repeat(43);
    const pool = { query: async () => ({ rows: [{ stateVerifier: state, nonceVerifier: "nonce", pkceVerifier: "verifier", redirectTarget: "https://app.example.test/callback" }] }) };
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "key-1" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: "https://id.example.test", sub: "subject-1", aud: "client", exp: Math.floor(Date.now() / 1000) + 300, nonce: "nonce", amr: ["mfa"] })).toString("base64url");
    const signingInput = `${header}.${payload}`;
    const signer = createSign("RSA-SHA256"); signer.update(signingInput); signer.end();
    const signature = signer.sign(privateKey).toString("base64url");
    const provider = { exchangeCode: async () => ({ idToken: `${signingInput}.${signature}` }), fetchJwks: async () => ({ keys: [{ ...jwk, kid: "key-1", alg: "RS256" }] }) };
    await expect(validateOidcCallback(pool, { state, code: "code" }, { issuer: "https://id.example.test", clientId: "client", redirectUri: "https://app.example.test/callback", tokenEndpoint: "https://id.example.test/token", jwksUri: "https://id.example.test/jwks" }, provider)).resolves.toEqual({ issuer: "https://id.example.test", subject: "subject-1", mfaAssured: true });
  });

  it("fails closed for missing, expired, and replayed state", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const provider = { exchangeCode: async () => { throw new Error("must not exchange"); }, fetchJwks: async () => ({ keys: [] }) };
    await expect(validateOidcCallback(pool, {}, { issuer: "https://id.example.test", clientId: "client", redirectUri: "https://app.example.test/callback", tokenEndpoint: "https://id.example.test/token", jwksUri: "https://id.example.test/jwks" }, provider)).rejects.toThrow("Authentication request is invalid.");
    await expect(validateOidcCallback(pool, { state: "s".repeat(43), code: "code" }, { issuer: "https://id.example.test", clientId: "client", redirectUri: "https://app.example.test/callback", tokenEndpoint: "https://id.example.test/token", jwksUri: "https://id.example.test/jwks" }, provider)).rejects.toThrow("Authentication request is invalid.");
  });

  it("consumes state before provider validation and returns only identity material", async () => {
    const state = "s".repeat(43); let consumed = false;
    const pool = { query: async () => { consumed = true; return { rows: [{ stateVerifier: state, nonceVerifier: "n", pkceVerifier: "p", redirectTarget: "https://app.example.test/callback" }] }; } };
    const provider = { exchangeCode: async (_code: string, verifier: string) => { expect(consumed).toBe(true); expect(verifier).toBe("p"); return { idToken: "bad.token.value" }; }, fetchJwks: async () => ({ keys: [] }) };
    await expect(validateOidcCallback(pool, { state, code: "code" }, { issuer: "https://id.example.test", clientId: "client", redirectUri: "https://app.example.test/callback", tokenEndpoint: "https://id.example.test/token", jwksUri: "https://id.example.test/jwks" }, provider)).rejects.toThrow("Authentication request is invalid.");
  });
});
