import { createHash, randomBytes } from "node:crypto";
type OidcPool = Readonly<{ query: (text: string, values: unknown[]) => Promise<Readonly<{ rows: Record<string, unknown>[] }>> }>;
type OidcConfig = Readonly<{ issuer: string; authorizationEndpoint: string; clientId: string; redirectUri: string; allowedOrigin: string; requestOrigin: string }>;
type Transaction = Readonly<{ stateVerifier: string; nonceVerifier: string; pkceVerifier: string; redirectTarget: string }>;

function verifier(): string { return randomBytes(32).toString("base64url"); }

function validHttpsUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("OIDC login request is invalid.");
  return url;
}

export async function createOidcLoginInitiation(pool: OidcPool, config: OidcConfig) {
  try {
    const issuer = validHttpsUrl(config.issuer);
    const authorizationEndpoint = validHttpsUrl(config.authorizationEndpoint);
    const redirectUri = validHttpsUrl(config.redirectUri);
    const allowedOrigin = validHttpsUrl(config.allowedOrigin);
    const requestOrigin = validHttpsUrl(config.requestOrigin);
    if (issuer.origin !== authorizationEndpoint.origin || redirectUri.origin !== allowedOrigin.origin || requestOrigin.origin !== allowedOrigin.origin || !config.clientId || config.clientId.length > 200) throw new Error();
    const stateVerifier = verifier();
    const nonceVerifier = verifier();
    const pkceVerifier = verifier();
    const challenge = createHash("sha256").update(pkceVerifier).digest("base64url");
    await pool.query("insert into app.oidc_login_transactions (state_verifier, nonce_verifier, pkce_verifier, redirect_target, expires_at) values ($1, $2, $3, $4, current_timestamp + interval '10 minutes')", [stateVerifier, nonceVerifier, pkceVerifier, redirectUri.toString()]);
    const url = new URL(authorizationEndpoint);
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri.toString());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid");
    url.searchParams.set("state", stateVerifier);
    url.searchParams.set("nonce", nonceVerifier);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return { authorizationUrl: url.toString() };
  } catch { throw new Error("OIDC login request is invalid."); }
}

export async function consumeOidcLoginTransaction(pool: OidcPool, state: string): Promise<Transaction | null> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(state)) return null;
  const result = await pool.query("update app.oidc_login_transactions set consumed_at = current_timestamp where state_verifier = $1 and consumed_at is null and expires_at > current_timestamp returning state_verifier as \"stateVerifier\", nonce_verifier as \"nonceVerifier\", pkce_verifier as \"pkceVerifier\", redirect_target as \"redirectTarget\"", [state]);
  return (result.rows[0] as unknown as Transaction | undefined) ?? null;
}
