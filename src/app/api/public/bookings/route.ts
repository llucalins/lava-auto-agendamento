import { NextResponse } from "next/server";
import { confirmBooking } from "../../../../server/capabilities/booking-lifecycle/confirm";
import { getDatabasePool } from "../../../../server/persistence/pool";

export async function POST(request: Request) {
  const headers = { "cache-control": "no-store" };
  try {
    const body = await request.json() as { intentKey?: string; material?: Record<string, unknown> };
    const key = process.env.CONFIRMATION_FINGERPRINT_KEY;
    if (!key || !body.intentKey || !body.material) return NextResponse.json({ kind: "INVALID_INPUT" }, { status: 400, headers });
    const result = await confirmBooking(getDatabasePool(), { intentKey: body.intentKey, fingerprintKey: key, expiresAt: new Date(Date.now() + 86_400_000), material: { ...body.material, serviceStart: new Date(String(body.material.serviceStart)) } as never });
    return NextResponse.json(result, { status: result.kind === "TRANSIENT" ? 503 : 200, headers });
  } catch { return NextResponse.json({ kind: "INVALID_INPUT" }, { status: 400, headers }); }
}
