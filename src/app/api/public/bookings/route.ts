import { NextResponse } from "next/server";
import { confirmBooking } from "../../../../server/capabilities/booking-lifecycle/confirm";
import { getDatabasePool } from "../../../../server/persistence/pool";
import { readBoundedJson, routeResourcePolicies, runWithRouteConcurrency } from "../../../../server/security/resource-controls";

export async function POST(request: Request) {
  const headers = {
    "cache-control": "private, no-store, max-age=0",
    expires: "0",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
  try {
    return await runWithRouteConcurrency("booking-confirmation", async () => {
    const body = await readBoundedJson(request, routeResourcePolicies["booking-confirmation"].maxBodyBytes) as { intentKey?: string; material?: Record<string, unknown> };
    const key = process.env.CONFIRMATION_FINGERPRINT_KEY;
    if (!key || !body.intentKey || !body.material) return NextResponse.json({ kind: "INVALID_INPUT" }, { status: 400, headers });
    const result = await confirmBooking(getDatabasePool(), { intentKey: body.intentKey, fingerprintKey: key, expiresAt: new Date(Date.now() + 86_400_000), material: { ...body.material, serviceStart: new Date(String(body.material.serviceStart)) } as never });
    return NextResponse.json(result, { status: result.kind === "TRANSIENT" ? 503 : 200, headers });
    }, routeResourcePolicies["booking-confirmation"].maxConcurrent);
  } catch (error) {
    const overloaded = error instanceof Error && "code" in error && error.code === "OVERLOADED";
    return NextResponse.json({ kind: overloaded ? "TRANSIENT" : "INVALID_INPUT" }, { status: overloaded ? 503 : 400, headers });
  }
}
