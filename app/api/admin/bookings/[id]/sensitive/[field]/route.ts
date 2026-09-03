import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  discloseSensitiveField,
  SensitiveDisclosureAuditUnavailableError,
  SensitiveDisclosureDeniedError,
} from "../../../../../../../src/server/capabilities/admin-operations/sensitive-disclosure";
import { getDatabasePool } from "../../../../../../../src/server/persistence/pool";
import { requireCsrf } from "../../../../../../../src/server/security/csrf";

export const runtime = "nodejs";

const bodySchema = z.object({
  purpose: z.literal("BOOKING_OPERATION"),
  reason: z.string(),
}).strict();
const responseHeaders = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  expires: "0",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  vary: "Cookie",
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; field: string }> },
) {
  const pool = getDatabasePool();
  if (!(await requireCsrf(request, pool))) return forbidden();
  const sessionCookie = (await cookies()).get("__Host-admin_session")?.value;
  if (!sessionCookie) return forbidden();

  try {
    const text = await request.text();
    if (text.length === 0 || text.length > 1_024) return invalid();
    const body = bodySchema.parse(JSON.parse(text) as unknown);
    const { id, field } = await context.params;
    const requestId = z.uuid().parse(request.headers.get("idempotency-key"));
    const disclosed = await discloseSensitiveField(pool, sessionCookie, {
      bookingId: id,
      field: z.enum(["CPF", "PICKUP_ADDRESS"]).parse(field),
      purpose: body.purpose,
      reason: body.reason,
      correlationId: requestId,
      requestId,
    });
    return NextResponse.json(disclosed, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return invalid();
    if (error instanceof SensitiveDisclosureDeniedError) return forbidden();
    if (error instanceof SensitiveDisclosureAuditUnavailableError) {
      return NextResponse.json({ kind: "AUDIT_UNAVAILABLE" }, { status: 503, headers: responseHeaders });
    }
    return NextResponse.json({ kind: "SENSITIVE_DISCLOSURE_UNAVAILABLE" }, { status: 503, headers: responseHeaders });
  }
}

function forbidden() {
  return NextResponse.json({ kind: "SENSITIVE_FIELD_FORBIDDEN" }, { status: 403, headers: responseHeaders });
}

function invalid() {
  return NextResponse.json({ kind: "INVALID_REQUEST" }, { status: 422, headers: responseHeaders });
}
