import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { applyGuardedCalendar } from "../../../../src/server/capabilities/admin-operations/calendar-conflicts";
import { getDatabasePool } from "../../../../src/server/persistence/pool";
import { requireCsrf } from "../../../../src/server/security/csrf";

const noStore = { "cache-control": "no-store" };
const requestSchema = z.object({ configuration: z.unknown(), acknowledgeConflicts: z.boolean() }).strict();

export async function PUT(request: Request) {
  const pool = getDatabasePool();
  if (!(await requireCsrf(request, pool))) return forbidden();
  const sessionCookie = (await cookies()).get("__Host-admin_session")?.value;
  if (!sessionCookie) return forbidden();

  try {
    const text = await request.text();
    if (text.length === 0 || text.length > 131_072) throw new Error("Invalid calendar configuration");
    const body = requestSchema.parse(JSON.parse(text) as unknown);
    const result = await applyGuardedCalendar(
      pool,
      sessionCookie,
      body.configuration,
      body.acknowledgeConflicts,
    );
    return NextResponse.json(result, {
      status: result.kind === "CONFLICT_WITH_EXISTING_BOOKINGS" ? 409 : 200,
      headers: noStore,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") return forbidden();
    if (error instanceof Error && error.message === "Stale calendar revision") {
      return NextResponse.json({ kind: "STALE_RESOURCE" }, { status: 409, headers: noStore });
    }
    return NextResponse.json({ kind: "INVALID_REQUEST" }, { status: 422, headers: noStore });
  }
}

function forbidden() {
  return NextResponse.json({ kind: "FORBIDDEN" }, { status: 403, headers: noStore });
}
