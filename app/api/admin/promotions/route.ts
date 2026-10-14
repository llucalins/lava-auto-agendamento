import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createAdminPromotion, listAdminPromotions } from "../../../../src/server/capabilities/promotions/management";
import { getDatabasePool } from "../../../../src/server/persistence/pool";
import { requireCsrf } from "../../../../src/server/security/csrf";

const noStore = { "cache-control": "no-store" };

export async function GET() {
  const session = (await cookies()).get("__Host-admin_session")?.value;
  if (!session) return forbidden();
  try {
    return NextResponse.json({ promotions: await listAdminPromotions(getDatabasePool(), session) }, { headers: noStore });
  } catch (error) {
    return error instanceof Error && error.message === "Forbidden" ? forbidden() : unavailable();
  }
}

export async function POST(request: Request) {
  const pool = getDatabasePool();
  if (!(await requireCsrf(request, pool))) return forbidden();
  const session = (await cookies()).get("__Host-admin_session")?.value;
  if (!session) return forbidden();
  try {
    const result = await createAdminPromotion(pool, session, await readBoundedJson(request));
    return NextResponse.json({ kind: "PROMOTION_CREATED", ...result }, { status: 201, headers: noStore });
  } catch (error) {
    return mutationError(error);
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text || text.length > 8_192) throw new Error("Invalid promotion terms");
  return JSON.parse(text) as unknown;
}

function forbidden() {
  return NextResponse.json({ kind: "FORBIDDEN" }, { status: 403, headers: noStore });
}

function mutationError(error: unknown) {
  if (error instanceof Error && error.message === "Forbidden") return forbidden();
  const message = error instanceof Error ? error.message : "";
  if (message === "Stale promotion revision") return NextResponse.json({ kind: "STALE_RESOURCE" }, { status: 409, headers: noStore });
  if (message.includes("conflicts with an active promotion")) return NextResponse.json({ kind: "PROMOTION_CONFLICT" }, { status: 409, headers: noStore });
  if (message.includes("exceeds service price")) return NextResponse.json({ kind: "DISCOUNT_EXCEEDS_PRICE" }, { status: 422, headers: noStore });
  return NextResponse.json({ kind: "INVALID_REQUEST" }, { status: 422, headers: noStore });
}

function unavailable() {
  return NextResponse.json({ kind: "UNAVAILABLE" }, { status: 503, headers: noStore });
}
