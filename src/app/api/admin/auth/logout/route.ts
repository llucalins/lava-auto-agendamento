import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireCsrf } from "../../../../../server/security/csrf";
import { getDatabasePool } from "../../../../../server/persistence/pool";
import { createHash } from "node:crypto";

export async function POST(request: Request) {
  const pool = getDatabasePool();
  if (!(await requireCsrf(request, pool))) return NextResponse.json({ kind: "CSRF_FAILED" }, { status: 403 });
  const cookie = (await cookies()).get("__Host-admin_session")?.value;
  if (!cookie) return NextResponse.json({ kind: "UNAUTHENTICATED" }, { status: 401 });
  await pool.query("update app.admin_sessions set revoked_at = current_timestamp where session_verifier_hash = $1 and revoked_at is null", [createHash("sha256").update(cookie).digest("hex")]);
  const response = NextResponse.json({ kind: "LOGGED_OUT" }, { headers: { "cache-control": "no-store" } });
  response.cookies.set("__Host-admin_session", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set("__Host-admin_csrf", "", { httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
