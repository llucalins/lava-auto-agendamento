import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { withTransaction } from "../../persistence/transaction";
import { resolveAuthorizedSession } from "../admin-access/authorization";
import { writeAuditEvent } from "../audit-trail/writer";
import { releaseCancelledBookingCapacity } from "../booking-lifecycle/allocations";

const cancellationSchema = z.object({
  bookingId: z.uuid(),
  expectedRevision: z.number().int().min(1),
}).strict();

export type AdminBookingCancellation = z.input<typeof cancellationSchema>;
export type AdminBookingCancellationResult = Readonly<{
  status: "CANCELLED";
  revision: number;
  auditEventId: string;
}>;

type BookingRow = Readonly<{ status: string; revision: number }>;

export async function cancelAdminBooking(
  pool: Pick<Pool, "connect">,
  sessionCookie: string,
  command: AdminBookingCancellation,
): Promise<AdminBookingCancellationResult> {
  return withTransaction(pool, (client) => cancelAdminBookingInTransaction(client, sessionCookie, command));
}

export async function cancelAdminBookingInTransaction(
  client: PoolClient,
  sessionCookie: string,
  command: AdminBookingCancellation,
): Promise<AdminBookingCancellationResult> {
  const parsed = cancellationSchema.safeParse(command);
  if (!parsed.success) throw new Error("Invalid booking cancellation");

  const actor = await resolveAuthorizedSession(client, sessionCookie, "BOOKING_CANCEL");
  if (!actor) throw new Error("Forbidden");

  const booking = await client.query<BookingRow>(
    "select status, revision from app.bookings where booking_id = $1 for update",
    [parsed.data.bookingId],
  );
  const current = booking.rows[0];
  if (!current || current.status !== "SCHEDULED" || current.revision !== parsed.data.expectedRevision) {
    throw new Error("Invalid booking cancellation");
  }

  const updated = await client.query<BookingRow>(
    "update app.bookings set status = 'CANCELLED', revision = revision + 1 where booking_id = $1 and revision = $2 returning status, revision",
    [parsed.data.bookingId, parsed.data.expectedRevision],
  );
  const result = updated.rows[0];
  if (!result || result.status !== "CANCELLED") throw new Error("Invalid booking cancellation");

  if (!(await releaseCancelledBookingCapacity(client, parsed.data.bookingId))) {
    throw new Error("Invalid booking cancellation");
  }

  const auditEventId = await writeAuditEvent(client, {
    category: "BOOKING_MUTATION",
    action: "BOOKING_CANCELLED",
    outcome: "SUCCEEDED",
    actorRef: actor.adminId,
    targetRef: parsed.data.bookingId,
    reasonCode: "SCHEDULED_TO_CANCELLED",
  });

  return { status: "CANCELLED", revision: result.revision, auditEventId };
}
