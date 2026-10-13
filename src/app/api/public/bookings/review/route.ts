import { NextResponse } from "next/server";

import { createBookingReview } from "../../../../../server/capabilities/public-booking-flow/review";
import { getDatabasePool } from "../../../../../server/persistence/pool";
import { readBoundedJson } from "../../../../../server/security/resource-controls";

const headers = {
  "cache-control": "private, no-store, max-age=0",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

export async function POST(request: Request) {
  try {
    const body = await readBoundedJson(request, 4_096) as { packageId?: string; serviceStart?: string };
    const signingKey = process.env.CONFIRMATION_FINGERPRINT_KEY;
    if (!signingKey || !body.packageId || !body.serviceStart) throw new Error("Invalid review request");
    const result = await createBookingReview(
      getDatabasePool(),
      { packageId: body.packageId, serviceStart: new Date(body.serviceStart) },
      signingKey,
    );
    return NextResponse.json(result, { status: result.kind === "READY" ? 200 : 409, headers });
  } catch {
    return NextResponse.json({ kind: "INVALID_INPUT" }, { status: 400, headers });
  }
}
