import { NextResponse } from "next/server";

import { getDatabasePool } from "../../../server/persistence/pool";
import { isPiiProcessingAllowed } from "../../../server/security/pii-processing-gate";

export async function GET() {
  const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (!isPiiProcessingAllowed(process.env)) {
    return NextResponse.json({ status: "not_ready" }, { status: 503, headers });
  }
  try {
    await getDatabasePool().query("select 1");
    return NextResponse.json({ status: "ready" }, { headers });
  } catch {
    return NextResponse.json({ status: "not_ready" }, { status: 503, headers });
  }
}
