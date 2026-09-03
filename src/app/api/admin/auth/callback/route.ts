import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createOidcProvider, validateOidcCallback } from "../../../../../server/capabilities/admin-access/oidc-callback";
import { createLocalSession } from "../../../../../server/capabilities/admin-access/sessions";
import { getDatabasePool } from "../../../../../server/persistence/pool";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const issuer = process.env.OIDC_ISSUER; const clientId = process.env.OIDC_CLIENT_ID; const redirectUri = process.env.OIDC_REDIRECT_URI; const tokenEndpoint = process.env.OIDC_TOKEN_ENDPOINT; const jwksUri = process.env.OIDC_JWKS_URI;
    if (!issuer || !clientId || !redirectUri || !tokenEndpoint || !jwksUri) throw new Error();
    const pool = getDatabasePool();
    const identity = await validateOidcCallback(pool, { state: url.searchParams.get("state") ?? undefined, code: url.searchParams.get("code") ?? undefined, error: url.searchParams.get("error") ?? undefined }, { issuer, clientId, redirectUri, tokenEndpoint, jwksUri }, createOidcProvider({ tokenEndpoint, jwksUri, clientId, clientSecret: process.env.OIDC_CLIENT_SECRET }));
    const session = await createLocalSession(pool, identity);
    const cookieStore = await cookies();
    cookieStore.set("__Host-admin_session", session.cookieValue, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 8 * 60 * 60, expires: session.expiresAt });
    cookieStore.set("__Host-admin_csrf", session.csrfToken, { httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 8 * 60 * 60, expires: session.expiresAt });
    return NextResponse.json({ kind: "AUTHENTICATED" }, { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ kind: "AUTHENTICATION_FAILED" }, { status: 400, headers: { "cache-control": "no-store" } }); }
}
