import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { reviseAdminPackage } from "../../../../../src/server/capabilities/admin-operations/package-management";
import { getDatabasePool } from "../../../../../src/server/persistence/pool";
import { requireCsrf } from "../../../../../src/server/security/csrf";

const noStore = { "cache-control": "no-store" };

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const pool = getDatabasePool();
  if (!(await requireCsrf(request, pool))) return forbidden();
  const sessionCookie = (await cookies()).get("__Host-admin_session")?.value;
  if (!sessionCookie) return forbidden();

  try {
    const text = await request.text();
    if (text.length === 0 || text.length > 4_096) throw new Error("Invalid package terms");
    const body = JSON.parse(text) as Record<string, unknown>;
    const { id } = await context.params;
    const result = await reviseAdminPackage(pool, sessionCookie, { ...body, packageId: id });
    return NextResponse.json({
      kind: "PACKAGE_REVISED",
      packageId: result.packageId,
      revision: result.revision,
      state: result.state,
    }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") return forbidden();
    if (error instanceof Error && error.message === "Stale package revision") {
      return NextResponse.json({ kind: "STALE_RESOURCE" }, { status: 409, headers: noStore });
    }
    return NextResponse.json({ kind: "INVALID_REQUEST" }, { status: 422, headers: noStore });
  }
}

function forbidden() {
  return NextResponse.json({ kind: "FORBIDDEN" }, { status: 403, headers: noStore });
}
