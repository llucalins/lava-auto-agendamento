import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { z } from "zod";

const createScheduledBookingSchema = z.object({
  packageId: z.uuid(),
  serviceStart: z.date(),
  serviceMode: z.enum(["DROP_OFF", "PICKUP_REQUESTED"]),
  intendedPaymentMethod: z.enum(["PIX", "CASH", "CREDIT_CARD", "DEBIT_CARD"]),
});

export type CreateScheduledBooking = Readonly<{
  packageId: string;
  serviceStart: Date;
  serviceMode: "DROP_OFF" | "PICKUP_REQUESTED";
  intendedPaymentMethod: "PIX" | "CASH" | "CREDIT_CARD" | "DEBIT_CARD";
}>;

export type ScheduledBooking = Readonly<{
  bookingId: string;
  packageId: string;
  packageRevision: number;
  status: "SCHEDULED";
  serviceStart: string;
  serviceEnd: string;
}>;

type ScheduledBookingRow = Readonly<{
  bookingId: string;
  packageId: string;
  packageRevision: number;
  status: "SCHEDULED";
  serviceStart: Date;
  serviceEnd: Date;
}>;

export async function createScheduledBooking(
  pool: Pick<Pool, "query">,
  command: CreateScheduledBooking,
): Promise<ScheduledBooking> {
  const parsed = createScheduledBookingSchema.safeParse(command);
  if (!parsed.success || Number.isNaN(parsed.data.serviceStart.getTime())) {
    throw new Error("Booking request is invalid.");
  }

  const result = await pool.query<ScheduledBookingRow>(
    `with current_package as (
       select r.package_id, r.revision, r.name, r.description, r.price_centavos, r.duration_minutes
       from app.service_packages p
       join app.service_package_revisions r
         on p.package_id = r.package_id and p.current_revision = r.revision
       where p.package_id = $2 and r.state = 'ACTIVE'
     ), created_booking as (
       insert into app.bookings (
         booking_id, revision, status, service_start, service_end,
         package_id, package_revision, service_mode, intended_payment_method
       )
       select $1, 1, 'SCHEDULED', $3::timestamptz,
              $3::timestamptz + make_interval(mins => current_package.duration_minutes),
              current_package.package_id, current_package.revision, $4, $5
       from current_package
       returning booking_id, package_id, package_revision, status, service_start, service_end
     ), snapshot as (
       insert into app.booking_package_snapshots (
         booking_id, package_id, package_revision, name, description,
         price_centavos, currency, duration_minutes
       )
       select booking.booking_id, package.package_id, package.revision, package.name,
              package.description, package.price_centavos, 'BRL', package.duration_minutes
       from created_booking booking
       join current_package package
         on package.package_id = booking.package_id and package.revision = booking.package_revision
     )
     select booking_id as "bookingId", package_id as "packageId",
            package_revision as "packageRevision", status,
            service_start as "serviceStart", service_end as "serviceEnd"
     from created_booking`,
    [
      randomUUID(),
      parsed.data.packageId,
      parsed.data.serviceStart,
      parsed.data.serviceMode,
      parsed.data.intendedPaymentMethod,
    ],
  );

  const booking = result.rows[0];
  if (!booking) {
    throw new Error("Booking request is invalid.");
  }

  return {
    ...booking,
    serviceStart: booking.serviceStart.toISOString(),
    serviceEnd: booking.serviceEnd.toISOString(),
  };
}
