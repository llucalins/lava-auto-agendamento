import type { Pool } from "pg";
import { z } from "zod";

import { resolveAuthorizedSession } from "../admin-access/authorization";

const bookingIdSchema = z.uuid();

export type AdminBookingDetail = Readonly<{
  bookingId: string;
  serviceStart: string;
  serviceEnd: string;
  status: string;
  package: Readonly<{
    name: string;
    description: string | null;
    priceCentavos: number;
    currency: string;
    durationMinutes: number;
  }>;
  intendedPaymentMethod: string;
  serviceMode: string;
  fullName: string;
  phoneWhatsapp: string;
  email: string | null;
  vehicleModel: string;
  licencePlate: string;
  vehicleColor: string;
}>;

type BookingDetailPool = Pick<Pool, "query">;
type BookingDetailRow = Readonly<{
  bookingId: string;
  serviceStart: Date;
  serviceEnd: Date;
  status: string;
  packageName: string;
  packageDescription: string | null;
  packagePriceCentavos: string;
  packageCurrency: string;
  packageDurationMinutes: number;
  intendedPaymentMethod: string;
  serviceMode: string;
  fullName: string;
  phoneWhatsapp: string;
  email: string | null;
  vehicleModel: string;
  licencePlate: string;
  vehicleColor: string;
}>;

export async function getAdminBookingDetail(
  pool: BookingDetailPool,
  sessionCookie: string,
  bookingId: string,
): Promise<AdminBookingDetail | undefined> {
  if (!bookingIdSchema.safeParse(bookingId).success || !(await resolveAuthorizedSession(pool, sessionCookie, "BOOKING_READ"))) {
    throw new Error("Forbidden");
  }

  const result = await pool.query<BookingDetailRow>(
    `select booking.booking_id as "bookingId", booking.service_start as "serviceStart",
            booking.service_end as "serviceEnd", booking.status,
            snapshot.name as "packageName", snapshot.description as "packageDescription",
            snapshot.price_centavos::text as "packagePriceCentavos",
            snapshot.currency as "packageCurrency", snapshot.duration_minutes as "packageDurationMinutes",
            booking.intended_payment_method as "intendedPaymentMethod", booking.service_mode as "serviceMode",
            pii.full_name as "fullName", pii.phone_whatsapp as "phoneWhatsapp", pii.email,
            pii.vehicle_model as "vehicleModel", pii.licence_plate as "licencePlate",
            pii.vehicle_color as "vehicleColor"
     from app.bookings booking
     join app.booking_package_snapshots snapshot on snapshot.booking_id = booking.booking_id
     join app.booking_customer_vehicle_pii pii on pii.booking_id = booking.booking_id
     where booking.booking_id = $1`,
    [bookingId],
  );
  const booking = result.rows[0];
  if (!booking) return undefined;

  return {
    bookingId: booking.bookingId,
    serviceStart: booking.serviceStart.toISOString(),
    serviceEnd: booking.serviceEnd.toISOString(),
    status: booking.status,
    package: {
      name: booking.packageName,
      description: booking.packageDescription,
      priceCentavos: Number(booking.packagePriceCentavos),
      currency: booking.packageCurrency,
      durationMinutes: booking.packageDurationMinutes,
    },
    intendedPaymentMethod: booking.intendedPaymentMethod,
    serviceMode: booking.serviceMode,
    fullName: booking.fullName,
    phoneWhatsapp: booking.phoneWhatsapp,
    email: booking.email,
    vehicleModel: booking.vehicleModel,
    licencePlate: booking.licencePlate,
    vehicleColor: booking.vehicleColor,
  };
}
