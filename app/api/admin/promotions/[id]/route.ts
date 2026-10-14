import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { reviseAdminPromotion } from "../../../../../src/server/capabilities/promotions/management";
import { getDatabasePool } from "../../../../../src/server/persistence/pool";
import { requireCsrf } from "../../../../../src/server/security/csrf";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const pool = getDatabasePool();
  if (!(await requireCsrf(request, pool))) return forbidden();
  const session = (await cookies()).get("__Host-admin_session")?.value;
  if (!session) return forbidden();
  try {
    const text = await request.text();
    if (!text || text.length > 8_192) throw new Error("Invalid promotion terms");
    const body = JSON.parse(text) as Record<string, unknown>;
    const { id } = await context.params;
    const result = await reviseAdminPromotion(pool, session, { ...body, promotionId: id });
    return NextResponse.json({ kind: "PROMOTION_REVISED", ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return mutationError(error);
  }
}

function forbidden() {
  return NextResponse.json({ kind: "FORBIDDEN" }, { status: 403, headers: { "cache-control": "no-store" } });
}

function mutationError(error: unknown) {
  if (error instanceof Error && error.message === "Forbidden") return forbidden();
  const message = error instanceof Error ? error.message : "";
  if (message === "Stale promotion revision") return NextResponse.json({ kind: "STALE_RESOURCE" }, { status: 409, headers: { "cache-control": "no-store" } });
  if (message.includes("conflicts with an active promotion")) return NextResponse.json({ kind: "PROMOTION_CONFLICT" }, { status: 409, headers: { "cache-control": "no-store" } });
  if (message.includes("exceeds service price")) return NextResponse.json({ kind: "DISCOUNT_EXCEEDS_PRICE" }, { status: 422, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ kind: "INVALID_REQUEST" }, { status: 422, headers: { "cache-control": "no-store" } });
}
