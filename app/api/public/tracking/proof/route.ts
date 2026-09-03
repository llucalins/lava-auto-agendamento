import { NextResponse } from "next/server";

import { getDatabasePool } from "../../../../../src/server/persistence/pool";
import { loadTrackingVerifierKey } from "../../../../../src/server/capabilities/public-status-tracking/issuance";
import { proveTrackingCredential } from "../../../../../src/server/capabilities/public-status-tracking/proof";
import { readBoundedJson, routeResourcePolicies, runWithRouteConcurrency } from "../../../../../src/server/security/resource-controls";

export const runtime = "nodejs";

const responseHeaders = {
  "cache-control": "private, no-store, max-age=0",
  expires: "0",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

export async function POST(request: Request) {
  if (!hasExactOrigin(request)) {
    return denied();
  }

  try {
    return await runWithRouteConcurrency("tracking-proof", async () => {
    const body = await readBoundedJson(request, routeResourcePolicies["tracking-proof"].maxBodyBytes) as { credential?: unknown };
    const credential = typeof body.credential === "string" ? body.credential : "";
    const proof = await proveTrackingCredential(
      getDatabasePool(),
      credential,
      loadTrackingVerifierKey(process.env),
    );
    if (!proof) return denied();
    const response = NextResponse.json(
      { kind: "TRACKING_SESSION_ESTABLISHED" },
      { status: 200, headers: responseHeaders },
    );
    response.cookies.set("__Host-tracking_session", proof.cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
      expires: proof.expiresAt,
    });
    return response;
    }, routeResourcePolicies["tracking-proof"].maxConcurrent);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "OVERLOADED") {
      return NextResponse.json({ kind: "TRACKING_PROOF_UNAVAILABLE" }, { status: 503, headers: responseHeaders });
    }
    if (error instanceof Error && "code" in error) return denied();
    return NextResponse.json({ kind: "TRACKING_PROOF_UNAVAILABLE" }, { status: 503, headers: responseHeaders });
  }
}

function denied() {
  return NextResponse.json({ kind: "TRACKING_PROOF_FAILED" }, { status: 403, headers: responseHeaders });
}

function hasExactOrigin(request: Request): boolean {
  const canonical = process.env.APP_ORIGIN;
  if (!canonical) return false;
  try {
    const supplied = new URL(request.headers.get("origin") ?? "");
    const expected = new URL(canonical);
    return supplied.origin === expected.origin
      && (process.env.NODE_ENV !== "production" || expected.protocol === "https:");
  } catch {
    return false;
  }
}
