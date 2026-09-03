import { NextResponse } from "next/server";

import { createOidcLoginInitiation } from "../../../../../src/server/capabilities/admin-access/oidc-init";
import { getDatabasePool } from "../../../../../src/server/persistence/pool";
import { routeResourcePolicies, runWithRouteConcurrency } from "../../../../../src/server/security/resource-controls";

const noStore = { "cache-control": "private, no-store, max-age=0", pragma: "no-cache" };

export async function POST(request: Request) {
  const issuer = process.env.OIDC_ISSUER;
  const authorizationEndpoint = process.env.OIDC_AUTHORIZATION_ENDPOINT;
  const clientId = process.env.OIDC_CLIENT_ID;
  const redirectUri = process.env.OIDC_REDIRECT_URI;
  const allowedOrigin = process.env.APP_ORIGIN;
  if (!issuer || !authorizationEndpoint || !clientId || !redirectUri || !allowedOrigin) {
    return NextResponse.json({ kind: "AUTHENTICATION_UNAVAILABLE" }, { status: 503, headers: noStore });
  }
  try {
    return await runWithRouteConcurrency("oidc", async () => {
      const requestOrigin = request.headers.get("origin") ?? "";
      const result = await createOidcLoginInitiation(getDatabasePool(), {
        issuer,
        authorizationEndpoint,
        clientId,
        redirectUri,
        allowedOrigin,
        requestOrigin,
      });
      return NextResponse.redirect(result.authorizationUrl, { status: 303, headers: noStore });
    }, routeResourcePolicies.oidc.maxConcurrent);
  } catch {
    return NextResponse.json({ kind: "AUTHENTICATION_FAILED" }, { status: 400, headers: noStore });
  }
}
