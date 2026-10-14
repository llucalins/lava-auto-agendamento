import { NextResponse } from "next/server";

import { getPublicEstablishmentProfile } from "../../../../src/server/capabilities/admin-operations/establishment-profile";
import { getDatabasePool } from "../../../../src/server/persistence/pool";

export async function GET() {
  const profile = await getPublicEstablishmentProfile(getDatabasePool());
  return NextResponse.json({ kind: "PUBLIC_ESTABLISHMENT", profile }, { headers: { "cache-control": "no-store" } });
}
