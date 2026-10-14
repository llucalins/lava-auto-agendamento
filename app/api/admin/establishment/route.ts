import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  getAdminEstablishmentProfile,
  updateEstablishmentProfile,
} from "../../../../src/server/capabilities/admin-operations/establishment-profile";
import { getDatabasePool } from "../../../../src/server/persistence/pool";
import { requireCsrf } from "../../../../src/server/security/csrf";

const noStore = { "cache-control": "no-store" };

export async function GET() {
  const session = (await cookies()).get("__Host-admin_session")?.value;
  if (!session) return forbidden();
  try {
    const profile = await getAdminEstablishmentProfile(getDatabasePool(), session);
    return NextResponse.json({ kind: "ESTABLISHMENT_PROFILE", profile }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  const pool = getDatabasePool();
  if (!(await requireCsrf(request, pool))) return forbidden();
  const session = (await cookies()).get("__Host-admin_session")?.value;
  if (!session) return forbidden();
  try {
    const text = await request.text();
    if (!text || text.length > 4_096) throw new Error("Invalid establishment profile");
    const profile = await updateEstablishmentProfile(pool, session, JSON.parse(text) as unknown);
    return NextResponse.json({ kind: "ESTABLISHMENT_PROFILE_UPDATED", profile }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

function forbidden() {
  return NextResponse.json({ kind: "FORBIDDEN" }, { status: 403, headers: noStore });
}

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message === "Forbidden") return forbidden();
  if (error instanceof Error && error.message === "Stale establishment profile revision") {
    return NextResponse.json({ kind: "STALE_RESOURCE" }, { status: 409, headers: noStore });
  }
  return NextResponse.json({ kind: "INVALID_REQUEST" }, { status: 422, headers: noStore });
}
