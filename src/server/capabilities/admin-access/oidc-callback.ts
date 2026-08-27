import { createPublicKey, createVerify } from "node:crypto";
import { consumeOidcLoginTransaction } from "./oidc-init";

type OidcPool = Parameters<typeof consumeOidcLoginTransaction>[0];
type Callback = Readonly<{ state?: string; code?: string; error?: string }>;
type Config = Readonly<{ issuer: string; clientId: string; redirectUri: string; tokenEndpoint: string; jwksUri: string; requireMfa?: boolean }>;
type TokenSet = Readonly<{ idToken: string }>;
type Jwk = Readonly<{ kid?: string; kty: string; n: string; e: string; alg?: string }>;
type Provider = Readonly<{ exchangeCode: (code: string, verifier: string, redirectUri: string) => Promise<TokenSet>; fetchJwks: () => Promise<Readonly<{ keys: Jwk[] }>> }>;

function invalid(): never { throw new Error("Authentication request is invalid."); }

function decodePart(value: string): Record<string, unknown> { try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>; } catch { return invalid(); } }

function verifyIdToken(token: string, jwks: Readonly<{ keys: Jwk[] }>, expected: Config, transaction: Readonly<{ nonceVerifier: string; redirectTarget: string }>): Readonly<{ issuer: string; subject: string; mfaAssured: boolean }> {
  const parts = token.split(".");
  if (parts.length !== 3) return invalid();
  const header = decodePart(parts[0]);
  const claims = decodePart(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") return invalid();
  const jwk = jwks.keys.find((key) => key.kid === header.kid && key.kty === "RSA" && key.alg === "RS256");
  if (!jwk) return invalid();
  const verifier = createVerify("RSA-SHA256"); verifier.update(`${parts[0]}.${parts[1]}`); verifier.end();
  if (!verifier.verify(createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"))) return invalid();
  if (claims.iss !== expected.issuer || typeof claims.sub !== "string" || !claims.sub || claims.aud !== expected.clientId && !(Array.isArray(claims.aud) && claims.aud.includes(expected.clientId))) return invalid();
  if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== expected.clientId) return invalid();
  if (typeof claims.exp !== "number" || claims.exp <= Math.floor(Date.now() / 1000) || claims.nonce !== transaction.nonceVerifier || transaction.redirectTarget !== expected.redirectUri) return invalid();
  const amr = Array.isArray(claims.amr) ? claims.amr : [];
  const mfaAssured = amr.includes("mfa") || claims.acr === "urn:example:loa:2";
  if (expected.requireMfa !== false && !mfaAssured) return invalid();
  return { issuer: expected.issuer, subject: claims.sub, mfaAssured };
}

export async function validateOidcCallback(pool: OidcPool, callback: Callback, expected: Config, provider: Provider) {
  try {
    if (callback.error || !callback.state || !callback.code) return invalid();
    for (const endpoint of [expected.issuer, expected.redirectUri, expected.tokenEndpoint, expected.jwksUri]) {
      const url = new URL(endpoint);
      if (url.protocol !== "https:" || url.username || url.password || url.hash) return invalid();
    }
    const transaction = await consumeOidcLoginTransaction(pool, callback.state);
    if (!transaction) return invalid();
    const tokens = await provider.exchangeCode(callback.code, transaction.pkceVerifier, transaction.redirectTarget);
    return verifyIdToken(tokens.idToken, await provider.fetchJwks(), expected, transaction);
  } catch { throw new Error("Authentication request is invalid."); }
}

export function createOidcProvider(config: Readonly<{ tokenEndpoint: string; jwksUri: string; clientId: string; clientSecret?: string }>): Provider {
  return {
    async exchangeCode(code, verifier, redirectUri) {
      const body = new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri, client_id: config.clientId });
      const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
      if (config.clientSecret) headers.authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
      const response = await fetch(config.tokenEndpoint, { method: "POST", headers, body });
      if (!response.ok) return invalid();
      const value = await response.json() as { id_token?: string };
      if (!value.id_token) return invalid();
      return { idToken: value.id_token };
    },
    async fetchJwks() { const response = await fetch(config.jwksUri, { cache: "no-store" }); if (!response.ok) return invalid(); return await response.json() as { keys: Jwk[] }; },
  };
}
