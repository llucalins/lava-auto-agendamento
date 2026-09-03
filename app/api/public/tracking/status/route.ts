import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { readTrackingStatus } from "../../../../../src/server/capabilities/public-status-tracking/status";
import { getDatabasePool } from "../../../../../src/server/persistence/pool";

export const runtime = "nodejs";

const responseHeaders = {
  "cache-control": "private, no-store, max-age=0",
  expires: "0",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

export async function GET(request: NextRequest) {
  try {
    const projection = await readTrackingStatus(
      getDatabasePool(),
      request.cookies.get("__Host-tracking_session")?.value ?? "",
    );
    if (!projection) return denied();
    return NextResponse.json(projection, { status: 200, headers: responseHeaders });
  } catch {
    return NextResponse.json({ kind: "TRACKING_STATUS_UNAVAILABLE" }, { status: 503, headers: responseHeaders });
  }
}

function denied() {
  const response = NextResponse.json(
    { kind: "TRACKING_SESSION_INVALID" },
    { status: 403, headers: responseHeaders },
  );
  response.cookies.set("__Host-tracking_session", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
