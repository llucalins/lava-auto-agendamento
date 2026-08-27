import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { bindCsrfToken, issueCsrfToken } from "../../../../../server/security/csrf";
import { getDatabasePool } from "../../../../../server/persistence/pool";

export async function GET() {
  const value = (await cookies()).get("__Host-admin_session")?.value;
  if (!value) return NextResponse.json({ kind: "UNAUTHENTICATED" }, { status: 401, headers: { "cache-control": "no-store" } });
  const token = issueCsrfToken();
  if (!(await bindCsrfToken(getDatabasePool(), value, token))) return NextResponse.json({ kind: "UNAUTHENTICATED" }, { status: 401, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ token }, { headers: { "cache-control": "no-store" } });
}
