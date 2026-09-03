import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { resolveAuthorizedSession } from "../admin-access/authorization";
import { writeAuditEvent } from "../audit-trail/writer";
import { withTransaction } from "../../persistence/transaction";

const transitionSchema = z.object({
  bookingId: z.uuid(),
  expectedRevision: z.number().int().min(1),
  status: z.enum(["IN_PROGRESS", "COMPLETED"]),
}).strict();

export type AdminBookingStatusTransition = z.input<typeof transitionSchema>;
export type AdminBookingStatusTransitionResult = Readonly<{
  status: "IN_PROGRESS" | "COMPLETED";
  revision: number;
  auditEventId: string;
}>;

type BookingRow = Readonly<{ status: string; revision: number }>;

export async function transitionAdminBookingStatus(
  pool: Pick<Pool, "connect">,
  sessionCookie: string,
  command: AdminBookingStatusTransition,
): Promise<AdminBookingStatusTransitionResult> {
  return withTransaction(pool, (client) => transitionAdminBookingStatusInTransaction(client, sessionCookie, command));
}

export async function transitionAdminBookingStatusInTransaction(
  client: PoolClient,
  sessionCookie: string,
  command: AdminBookingStatusTransition,
): Promise<AdminBookingStatusTransitionResult> {
  const parsed = transitionSchema.safeParse(command);
  if (!parsed.success) throw new Error("Invalid booking transition");

  const actor = await resolveAuthorizedSession(client, sessionCookie, "BOOKING_STATUS_UPDATE");
  if (!actor) throw new Error("Forbidden");

  const booking = await client.query<BookingRow>(
    "select status, revision from app.bookings where booking_id = $1 for update",
    [parsed.data.bookingId],
  );
  const current = booking.rows[0];
  if (!current || current.revision !== parsed.data.expectedRevision || !isApprovedTransition(current.status, parsed.data.status)) {
    throw new Error("Invalid booking transition");
  }

  const allocation = await client.query(
    "select allocation_id from app.capacity_allocations where booking_id = $1 and allocation_state = 'ACTIVE' and consumes_capacity for update",
    [parsed.data.bookingId],
  );
  if (allocation.rows.length !== 1) throw new Error("Invalid booking transition");

  const updated = await client.query<BookingRow>(
    "update app.bookings set status = $2, revision = revision + 1 where booking_id = $1 and revision = $3 returning status, revision",
    [parsed.data.bookingId, parsed.data.status, parsed.data.expectedRevision],
  );
  const result = updated.rows[0];
  if (!result) throw new Error("Invalid booking transition");

  const auditEventId = await writeAuditEvent(client, {
    category: "BOOKING_MUTATION",
    action: "BOOKING_STATUS_UPDATED",
    outcome: "SUCCEEDED",
    actorRef: actor.adminId,
    targetRef: parsed.data.bookingId,
    reasonCode: `${current.status}_TO_${parsed.data.status}`,
  });
  return { status: parsed.data.status, revision: result.revision, auditEventId };
}

function isApprovedTransition(
  current: string,
  target: "IN_PROGRESS" | "COMPLETED",
): boolean {
  return (current === "SCHEDULED" && target === "IN_PROGRESS")
    || (current === "IN_PROGRESS" && target === "COMPLETED");
}
