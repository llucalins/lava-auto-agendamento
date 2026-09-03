import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createAdminPackage } from "../../../../src/server/capabilities/admin-operations/package-management";
import { getDatabasePool } from "../../../../src/server/persistence/pool";
import { requireCsrf } from "../../../../src/server/security/csrf";

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const pool = getDatabasePool();
  if (!(await requireCsrf(request, pool))) return forbidden();
  const sessionCookie = (await cookies()).get("__Host-admin_session")?.value;
  if (!sessionCookie) return forbidden();

  try {
    const body = await readBoundedJson(request);
    const result = await createAdminPackage(pool, sessionCookie, body);
    return NextResponse.json({
      kind: "PACKAGE_CREATED",
      packageId: result.packageId,
      revision: result.revision,
      state: result.state,
    }, { status: 201, headers: noStore });
  } catch (error) {
    return packageError(error);
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length === 0 || text.length > 4_096) throw new Error("Invalid package terms");
  return JSON.parse(text) as unknown;
}

function forbidden() {
  return NextResponse.json({ kind: "FORBIDDEN" }, { status: 403, headers: noStore });
}

function packageError(error: unknown) {
  if (error instanceof Error && error.message === "Forbidden") return forbidden();
  return NextResponse.json({ kind: "INVALID_REQUEST" }, { status: 422, headers: noStore });
}
