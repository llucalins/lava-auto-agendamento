import { NextResponse } from "next/server";
import { z } from "zod";

import { cancelAdminBooking } from "../../../../../src/server/capabilities/admin-operations/cancel-booking";
import { transitionAdminBookingStatus } from "../../../../../src/server/capabilities/admin-operations/status-transition";
import { getDatabasePool } from "../../../../../src/server/persistence/pool";
import { requireCsrf } from "../../../../../src/server/security/csrf";
import { readBoundedJson } from "../../../../../src/server/security/resource-controls";

const noStore = { "cache-control": "private, no-store, max-age=0" };
const requestSchema = z.object({
  action: z.enum(["START", "COMPLETE", "CANCEL"]),
  expectedRevision: z.number().int().positive(),
}).strict();

export async function PATCH(request: Request, context: Readonly<{ params: Promise<{ id: string }> }>) {
  const pool = getDatabasePool();
  if (!(await requireCsrf(request, pool))) return response({ kind: "FORBIDDEN" }, 403);
  const sessionCookie = request.headers.get("cookie")?.match(/(?:^|;\s*)__Host-admin_session=([^;]+)/)?.[1];
  if (!sessionCookie) return response({ kind: "FORBIDDEN" }, 403);

  try {
    const { id } = await context.params;
    const body = requestSchema.parse(await readBoundedJson(request, 2_048));
    const result = body.action === "CANCEL"
      ? await cancelAdminBooking(pool, sessionCookie, { bookingId: id, expectedRevision: body.expectedRevision })
      : await transitionAdminBookingStatus(pool, sessionCookie, {
          bookingId: id,
          expectedRevision: body.expectedRevision,
          status: body.action === "START" ? "IN_PROGRESS" : "COMPLETED",
        });
    return response({ kind: "UPDATED", status: result.status, revision: result.revision }, 200);
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") return response({ kind: "FORBIDDEN" }, 403);
    if (error instanceof Error && error.message.startsWith("Invalid booking")) return response({ kind: "STALE_OR_INVALID_TRANSITION" }, 409);
    return response({ kind: "INVALID_INPUT" }, 400);
  }
}

function response(body: object, status: number) {
  return NextResponse.json(body, { status, headers: noStore });
}
